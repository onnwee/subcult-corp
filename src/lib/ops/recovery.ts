// Stale step recovery — find steps stuck in 'running' for too long and mark failed
import type { SupabaseClient } from '@supabase/supabase-js';
import { emitEvent } from './events';
import { writeMemory } from './memory';

const STALE_THRESHOLD_MINUTES = 30;

export async function recoverStaleSteps(
    sb: SupabaseClient,
): Promise<{ recovered: number }> {
    const threshold = new Date(
        Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000,
    ).toISOString();

    // Find steps that have been 'running' for too long
    const { data: staleSteps, error } = await sb
        .from('ops_mission_steps')
        .select('id, mission_id, kind, reserved_by')
        .eq('status', 'running')
        .lt('updated_at', threshold)
        .limit(20);

    if (error || !staleSteps?.length) {
        return { recovered: 0 };
    }

    let recovered = 0;

    for (const step of staleSteps) {
        const { error: updateError } = await sb
            .from('ops_mission_steps')
            .update({
                status: 'failed',
                failure_reason: `Stale: running for >${STALE_THRESHOLD_MINUTES}m with no progress`,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', step.id)
            .eq('status', 'running'); // Atomic: only if still running

        if (!updateError) {
            recovered++;

            await emitEvent(sb, {
                agent_id: 'system',
                kind: 'step_recovered',
                title: `Recovered stale step: ${step.kind}`,
                summary: `Step ${step.id} was running for >${STALE_THRESHOLD_MINUTES}m. Marked as failed.`,
                tags: ['system', 'recovery', 'stale'],
                metadata: { stepId: step.id, missionId: step.mission_id },
            });

            // Check if all steps in the mission are now done → finalize mission
            await maybeFinalializeMission(sb, step.mission_id);
        }
    }

    return { recovered };
}

/**
 * If all steps in a mission are terminal (succeeded/failed/skipped),
 * finalize the mission status.
 */
export async function maybeFinalializeMission(
    sb: SupabaseClient,
    missionId: string,
): Promise<void> {
    const { data: steps } = await sb
        .from('ops_mission_steps')
        .select('status')
        .eq('mission_id', missionId);

    if (!steps?.length) return;

    const allDone = steps.every(s =>
        ['succeeded', 'failed', 'skipped'].includes(s.status),
    );

    if (!allDone) return;

    const anyFailed = steps.some(s => s.status === 'failed');
    const newStatus = anyFailed ? 'failed' : 'succeeded';

    // Fetch the mission title + agent for memory writing
    const { data: mission } = await sb
        .from('ops_missions')
        .select('title, agent_id, failure_reason')
        .eq('id', missionId)
        .single();

    await sb
        .from('ops_missions')
        .update({
            status: newStatus,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...(anyFailed ?
                { failure_reason: 'One or more steps failed' }
            :   {}),
        })
        .eq('id', missionId)
        .in('status', ['approved', 'running']); // Don't overwrite already-finalized

    await emitEvent(sb, {
        agent_id: 'system',
        kind: `mission_${newStatus}`,
        title: `Mission ${newStatus}`,
        tags: ['mission', newStatus],
        metadata: { missionId },
    });

    // Write memory from mission outcome
    if (mission) {
        const agentId = (mission.agent_id as string) ?? 'brain';
        const title = (mission.title as string) ?? 'Unknown mission';

        if (newStatus === 'succeeded') {
            await writeMemory(sb, {
                agent_id: agentId,
                type: 'strategy',
                content: `Strategy succeeded: "${title}". This approach works.`,
                confidence: 0.65,
                tags: ['mission', 'succeeded'],
                source_trace_id: `mission-outcome:${missionId}`,
            });
        } else {
            const reason =
                (mission.failure_reason as string) ??
                'One or more steps failed';
            await writeMemory(sb, {
                agent_id: agentId,
                type: 'lesson',
                content: `Mission failed: "${title}". Reason: ${reason}`,
                confidence: 0.7,
                tags: ['mission', 'failed'],
                source_trace_id: `mission-outcome:${missionId}`,
            });
        }
    }
}
