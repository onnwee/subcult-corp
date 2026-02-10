// Cap gates — rate limiters and safety checks for proposals
import { sql } from '@/lib/db';
import type { ProposalInput, GateResult } from '../types';
import { getPolicy } from './policy';

const MAX_CONCURRENT_MISSIONS = 10;
const MAX_DAILY_STEPS_PER_AGENT = 50;

export async function checkCapGates(input: ProposalInput): Promise<GateResult> {
    // Gate 1: Active mission count
    const [{ count: activeMissions }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_missions
        WHERE status IN ('approved', 'running')
    `;

    if (activeMissions >= MAX_CONCURRENT_MISSIONS) {
        return {
            ok: false,
            reason: `Too many active missions (${activeMissions}/${MAX_CONCURRENT_MISSIONS})`,
        };
    }

    // Gate 2: Daily step count per agent
    const dailySteps = await countTodaySteps(input.agent_id);

    if (dailySteps >= MAX_DAILY_STEPS_PER_AGENT) {
        return {
            ok: false,
            reason: `Daily step limit reached for ${input.agent_id} (${dailySteps}/${MAX_DAILY_STEPS_PER_AGENT})`,
        };
    }

    // Gate 3: Content draft cap (policy-driven)
    try {
        const contentPolicy = await getPolicy('content_caps');
        const maxDrafts = (contentPolicy?.max_drafts_per_day as number) ?? 10;

        const draftKinds = ['draft_thread', 'draft_essay', 'prepare_statement'];
        const hasDraftStep = input.proposed_steps.some(s =>
            draftKinds.includes(s.kind),
        );

        if (hasDraftStep) {
            const todayStart = new Date();
            todayStart.setUTCHours(0, 0, 0, 0);

            const [{ count: todayDrafts }] = await sql<[{ count: number }]>`
                SELECT COUNT(*)::int as count FROM ops_mission_steps s
                JOIN ops_missions m ON s.mission_id = m.id
                WHERE m.created_by = ${input.agent_id}
                AND s.kind = ANY(${draftKinds})
                AND s.created_at >= ${todayStart.toISOString()}
            `;

            if (todayDrafts >= maxDrafts) {
                return {
                    ok: false,
                    reason: `Daily content draft limit reached (${todayDrafts}/${maxDrafts})`,
                };
            }
        }
    } catch {
        // content_caps policy may not exist; skip this gate
    }

    return { ok: true };
}

export async function countTodaySteps(agentId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_mission_steps s
        JOIN ops_missions m ON s.mission_id = m.id
        WHERE m.created_by = ${agentId}
        AND s.created_at >= ${todayStart.toISOString()}
    `;

    return count;
}
