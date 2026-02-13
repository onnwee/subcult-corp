// Outcome learner — extract lessons from completed missions
import { sql } from '@/lib/db';
import { writeMemory, enforceMemoryCap } from './memory';
import type { MemoryType } from '../types';

// Map step kinds to appropriate memory types
const STEP_KIND_TO_MEMORY_TYPE: Record<string, MemoryType> = {
    scan_signals: 'insight',
    research_topic: 'insight',
    classify_pattern: 'pattern',
    review_policy: 'strategy',
    audit_system: 'strategy',
    document_lesson: 'lesson',
    draft_thread: 'insight',
    draft_essay: 'insight',
    distill_insight: 'insight',
    consolidate_memory: 'strategy',
    trace_incentive: 'strategy',
    identify_assumption: 'insight',
    map_dependency: 'pattern',
    analyze_discourse: 'insight',
    critique_content: 'insight',
};

function memoryTypeForSteps(
    stepKinds: string[],
): MemoryType {
    // Pick the most common mapped type, fallback to 'lesson'
    const counts: Partial<Record<MemoryType, number>> = {};
    for (const kind of stepKinds) {
        const t = STEP_KIND_TO_MEMORY_TYPE[kind] ?? 'lesson';
        counts[t] = (counts[t] ?? 0) + 1;
    }
    let best: MemoryType = 'lesson';
    let bestCount = 0;
    for (const [type, count] of Object.entries(counts)) {
        if (count! > bestCount) {
            best = type as MemoryType;
            bestCount = count!;
        }
    }
    return best;
}

function buildMemoryContent(
    missionTitle: string,
    steps: { kind: string; result: unknown }[],
): { content: string; hasRichContent: boolean } {
    const completedWithResults = steps.filter(
        s => s.result && typeof s.result === 'object' && Object.keys(s.result as object).length > 0,
    );

    if (completedWithResults.length === 0) {
        return {
            content: `Completed mission "${missionTitle}" — no detailed step output recorded`,
            hasRichContent: false,
        };
    }

    // Build summary from step results
    const summaries: string[] = [];
    for (const step of completedWithResults) {
        const r = step.result as Record<string, unknown>;
        // Try common result fields: summary, content, output, message
        const text = (r.summary ?? r.content ?? r.output ?? r.message ?? r.result) as string | undefined;
        if (text && typeof text === 'string') {
            summaries.push(text.slice(0, 150));
        }
    }

    if (summaries.length === 0) {
        return {
            content: `Completed mission "${missionTitle}" with ${completedWithResults.length} step(s)`,
            hasRichContent: false,
        };
    }

    const joined = summaries.join('. ');
    return {
        content: `${missionTitle}: ${joined}`,
        hasRichContent: true,
    };
}

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

        // Fetch step details for richer memory
        const steps = await sql<{ kind: string; status: string; result: unknown }[]>`
            SELECT kind, status, result FROM ops_mission_steps
            WHERE mission_id = ${mission.id}
            ORDER BY created_at ASC
        `;

        const stepKinds = steps.map(s => s.kind);

        let content: string;
        let confidence: number;
        let memoryType: MemoryType;

        if (mission.status === 'failed') {
            content = `Mission "${mission.title}" failed: ${mission.failure_reason ?? 'unknown reason'}`;
            confidence = 0.8;
            memoryType = 'lesson';
        } else {
            const { content: richContent, hasRichContent } = buildMemoryContent(
                mission.title,
                steps,
            );
            content = richContent;
            confidence = hasRichContent ? 0.7 : 0.5;
            memoryType = memoryTypeForSteps(stepKinds);
        }

        const id = await writeMemory({
            agent_id: mission.created_by,
            type: memoryType,
            content: content.slice(0, 300),
            confidence,
            tags: ['outcome', mission.status, ...stepKinds.slice(0, 3)],
            source_trace_id: traceId,
        });

        if (id) {
            learned++;
            await enforceMemoryCap(mission.created_by);
        }
    }

    return { learned };
}
