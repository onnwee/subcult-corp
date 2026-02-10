// Outcome learner — extract lessons from completed missions
import { sql } from '@/lib/db';
import { writeMemory, enforceMemoryCap } from './memory';
import type { MemoryType } from '../types';

export async function learnFromOutcomes(): Promise<{ learned: number }> {
    const oneHourAgo = new Date(Date.now() - 60 * 60_000);

    const missions = await sql<
        {
            id: string;
            title: string;
            status: string;
            created_by: string;
            failure_reason: string | null;
        }[]
    >`
        SELECT id, title, status, created_by, failure_reason
        FROM ops_missions
        WHERE status IN ('succeeded', 'failed')
        AND completed_at >= ${oneHourAgo.toISOString()}
    `;

    let learned = 0;

    for (const mission of missions) {
        const traceId = `outcome:mission:${mission.id}`;

        const content =
            mission.status === 'succeeded' ?
                `Completed mission "${mission.title}" successfully`
            :   `Mission "${mission.title}" failed: ${mission.failure_reason ?? 'unknown reason'}`;

        const confidence = mission.status === 'succeeded' ? 0.7 : 0.8;

        const id = await writeMemory({
            agent_id: mission.created_by,
            type: 'lesson' as MemoryType,
            content: content.slice(0, 200),
            confidence,
            tags: ['outcome', mission.status],
            source_trace_id: traceId,
        });

        if (id) {
            learned++;
            await enforceMemoryCap(mission.created_by);
        }
    }

    return { learned };
}
