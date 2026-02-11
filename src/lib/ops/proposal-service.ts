// Proposal service — create, approve, and manage proposals
import { sql, jsonb } from '@/lib/db';
import type { ProposalInput, Proposal } from '../types';
import { getPolicy } from './policy';
import { checkCapGates } from './cap-gates';
import { emitEvent } from './events';
import { DAILY_PROPOSAL_LIMIT } from '../agents';

export async function createProposalAndMaybeAutoApprove(
    input: ProposalInput,
): Promise<{
    success: boolean;
    proposalId?: string;
    missionId?: string;
    reason?: string;
}> {
    // Daily proposal limit check
    const todayCount = await countTodayProposals(input.agent_id);
    if (todayCount >= DAILY_PROPOSAL_LIMIT) {
        return {
            success: false,
            reason: `Daily proposal limit (${DAILY_PROPOSAL_LIMIT}) reached for ${input.agent_id}`,
        };
    }

    // Cap gates check
    const gateResult = await checkCapGates(input);
    if (!gateResult.ok) {
        return { success: false, reason: gateResult.reason };
    }

    // Insert proposal
    const [proposal] = await sql<[{ id: string }]>`
        INSERT INTO ops_mission_proposals (agent_id, title, description, proposed_steps, source, source_trace_id, status)
        VALUES (
            ${input.agent_id},
            ${input.title},
            ${input.description ?? null},
            ${jsonb(input.proposed_steps)},
            ${input.source ?? 'agent'},
            ${input.source_trace_id ?? null},
            'pending'
        )
        RETURNING id
    `;

    const proposalId = proposal.id;

    // Check auto-approve
    const autoApprovePolicy = await getPolicy('auto_approve');
    const autoApproveEnabled = autoApprovePolicy.enabled as boolean;
    const allowedKinds =
        (autoApprovePolicy.allowed_step_kinds as string[]) ?? [];

    const shouldAutoApprove =
        autoApproveEnabled &&
        input.proposed_steps.every(step => allowedKinds.includes(step.kind));

    if (shouldAutoApprove) {
        await sql`
            UPDATE ops_mission_proposals
            SET status = 'accepted', auto_approved = true, updated_at = NOW()
            WHERE id = ${proposalId}
        `;

        const missionId = await createMissionFromProposal(proposalId);

        await emitEvent({
            agent_id: input.agent_id,
            kind: 'proposal_auto_approved',
            title: `Auto-approved: ${input.title}`,
            summary: `Proposal auto-approved with ${input.proposed_steps.length} step(s)`,
            tags: ['proposal', 'auto_approved'],
            metadata: { proposalId, missionId },
        });

        return { success: true, proposalId, missionId };
    }

    await emitEvent({
        agent_id: input.agent_id,
        kind: 'proposal_created',
        title: `Proposal: ${input.title}`,
        summary: `Awaiting review. ${input.proposed_steps.length} step(s).`,
        tags: ['proposal', 'pending'],
        metadata: { proposalId },
    });

    return { success: true, proposalId };
}

export async function createMissionFromProposal(
    proposalId: string,
): Promise<string> {
    const [proposal] = await sql<[Proposal]>`
        SELECT * FROM ops_mission_proposals WHERE id = ${proposalId}
    `;

    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

    const [mission] = await sql<[{ id: string }]>`
        INSERT INTO ops_missions (proposal_id, title, description, status, created_by)
        VALUES (
            ${proposalId},
            ${proposal.title},
            ${proposal.description ?? null},
            'approved',
            ${proposal.agent_id}
        )
        RETURNING id
    `;

    const missionId = mission.id;

    const steps = proposal.proposed_steps;

    for (const step of steps) {
        await sql`
            INSERT INTO ops_mission_steps (mission_id, kind, status, payload)
            VALUES (
                ${missionId},
                ${step.kind},
                'queued',
                ${jsonb(step.payload ?? {})}
            )
        `;
    }

    return missionId;
}

export async function countTodayProposals(agentId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_mission_proposals
        WHERE agent_id = ${agentId}
        AND created_at >= ${todayStart.toISOString()}
    `;

    return count;
}
