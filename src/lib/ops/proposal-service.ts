// Proposal Service — the single entry point for all proposal creation
// Everything goes through here: agent initiatives, triggers, reactions, conversations
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProposalInput, StepKind } from '../types';
import { checkCapGates } from './cap-gates';
import { getPolicy } from './policy';
import { emitEventAndCheckReactions } from './events';
import { DAILY_PROPOSAL_LIMIT } from '../agents';

interface ProposalResult {
    success: boolean;
    proposalId?: string;
    missionId?: string;
    rejected?: boolean;
    reason?: string;
}

/**
 * The single entry point for proposal creation.
 *
 * 1. Check daily limit for the agent
 * 2. Check cap gates (quota checks for step kinds)
 * 3. Insert the proposal
 * 4. Evaluate auto-approve
 * 5. If approved → create mission + steps
 * 6. Fire an event
 */
export async function createProposalAndMaybeAutoApprove(
    sb: SupabaseClient,
    input: ProposalInput,
): Promise<ProposalResult> {
    const {
        agent_id,
        title,
        description,
        proposed_steps,
        source,
        source_trace_id,
    } = input;

    // ── 1. Check daily proposal limit ──
    const dailyCount = await countTodayProposals(sb, agent_id);
    if (dailyCount >= DAILY_PROPOSAL_LIMIT) {
        return {
            success: false,
            rejected: true,
            reason: `Agent ${agent_id} hit daily proposal limit (${dailyCount}/${DAILY_PROPOSAL_LIMIT})`,
        };
    }

    // ── 2. Check cap gates ──
    const stepKinds = proposed_steps.map(s => s.kind);
    const gateResult = await checkCapGates(sb, stepKinds);
    if (!gateResult.ok) {
        // Insert as rejected (audit trail)
        const { data: rejectedProposal } = await sb
            .from('ops_mission_proposals')
            .insert({
                agent_id,
                title,
                description,
                status: 'rejected',
                rejection_reason: gateResult.reason,
                proposed_steps,
                source: source ?? 'agent',
                source_trace_id,
            })
            .select('id')
            .single();

        await emitEventAndCheckReactions(sb, {
            agent_id,
            kind: 'proposal_rejected',
            title: `Proposal rejected: ${title}`,
            summary: gateResult.reason,
            tags: ['proposal', 'rejected', 'gate'],
        });

        return {
            success: false,
            proposalId: rejectedProposal?.id,
            rejected: true,
            reason: gateResult.reason,
        };
    }

    // ── 3. Insert the proposal ──
    const { data: proposal, error: proposalError } = await sb
        .from('ops_mission_proposals')
        .insert({
            agent_id,
            title,
            description,
            status: 'pending',
            proposed_steps,
            source: source ?? 'agent',
            source_trace_id,
        })
        .select('id')
        .single();

    if (proposalError || !proposal) {
        return {
            success: false,
            reason: `Failed to insert proposal: ${proposalError?.message}`,
        };
    }

    // ── 4. Evaluate auto-approve ──
    const autoApprovePolicy = await getPolicy(sb, 'auto_approve');
    const autoApproveEnabled = autoApprovePolicy.enabled as boolean;
    const allowedKinds =
        (autoApprovePolicy.allowed_step_kinds as string[]) ?? [];

    const allStepsAutoApprovable =
        autoApproveEnabled && stepKinds.every(k => allowedKinds.includes(k));

    if (allStepsAutoApprovable) {
        // ── 5. Auto-approve → create mission + steps ──
        await sb
            .from('ops_mission_proposals')
            .update({
                status: 'accepted',
                auto_approved: true,
                updated_at: new Date().toISOString(),
            })
            .eq('id', proposal.id);

        const missionId = await createMissionFromProposal(
            sb,
            proposal.id,
            input,
        );

        // ── 6. Fire event ──
        await emitEventAndCheckReactions(sb, {
            agent_id,
            kind: 'proposal_approved',
            title: `Proposal auto-approved: ${title}`,
            summary: `Mission created with ${proposed_steps.length} step(s)`,
            tags: ['proposal', 'approved', 'auto'],
            metadata: { proposalId: proposal.id, missionId },
        });

        return {
            success: true,
            proposalId: proposal.id,
            missionId,
        };
    }

    // Not auto-approved → stays pending for manual review
    await emitEventAndCheckReactions(sb, {
        agent_id,
        kind: 'proposal_pending',
        title: `Proposal pending: ${title}`,
        summary: `Awaiting review (${proposed_steps.length} step(s))`,
        tags: ['proposal', 'pending'],
        metadata: { proposalId: proposal.id },
    });

    return {
        success: true,
        proposalId: proposal.id,
    };
}

// ─── Helpers ───

async function createMissionFromProposal(
    sb: SupabaseClient,
    proposalId: string,
    input: ProposalInput,
): Promise<string> {
    // Create the mission
    const { data: mission, error: missionError } = await sb
        .from('ops_missions')
        .insert({
            proposal_id: proposalId,
            title: input.title,
            description: input.description,
            status: 'approved',
            created_by: input.agent_id,
        })
        .select('id')
        .single();

    if (missionError || !mission) {
        throw new Error(`Failed to create mission: ${missionError?.message}`);
    }

    // Create steps
    const steps = input.proposed_steps.map(s => ({
        mission_id: mission.id,
        kind: s.kind,
        status: 'queued' as const,
        payload: s.payload ?? {},
    }));

    const { error: stepsError } = await sb
        .from('ops_mission_steps')
        .insert(steps);

    if (stepsError) {
        throw new Error(
            `Failed to create mission steps: ${stepsError.message}`,
        );
    }

    return mission.id;
}

async function countTodayProposals(
    sb: SupabaseClient,
    agentId: string,
): Promise<number> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count, error } = await sb
        .from('ops_mission_proposals')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId)
        .gte('created_at', todayStart.toISOString());

    if (error) {
        console.error('[proposal] Failed to count proposals:', error.message);
        return 0;
    }
    return count ?? 0;
}
