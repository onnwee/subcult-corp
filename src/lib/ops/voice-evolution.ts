// Voice evolution — derive personality modifiers from agent memory
import { sql } from '@/lib/db';

interface MemoryStats {
    total: number;
    insight_count: number;
    pattern_count: number;
    strategy_count: number;
    preference_count: number;
    lesson_count: number;
    top_tags: string[];
    tags: Map<string, number>;
    avg_confidence: number;
}

// 10-minute cache per agent
const voiceModifierCache = new Map<
    string,
    { modifiers: string[]; expiresAt: number }
>();
const CACHE_TTL_MS = 10 * 60_000;

export async function deriveVoiceModifiers(agentId: string): Promise<string[]> {
    const cached = voiceModifierCache.get(agentId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.modifiers;
    }

    const stats = await aggregateMemoryStats(agentId);

    if (stats.total < 5) {
        voiceModifierCache.set(agentId, {
            modifiers: [],
            expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return [];
    }

    const modifiers: string[] = [];

    // Rule 1: Heavy insight focus → analytical modifier
    if (stats.insight_count / stats.total > 0.4) {
        modifiers.push('analytical-focus');
    }

    // Rule 2: Many patterns detected → pattern-aware
    if (stats.pattern_count >= 5) {
        modifiers.push('pattern-aware');
    }

    // Rule 3: Strategy-heavy → strategic tone
    if (stats.strategy_count / stats.total > 0.3) {
        modifiers.push('strategic');
    }

    // Rule 4: Lesson-heavy → reflective tone
    if (stats.lesson_count >= 3) {
        modifiers.push('reflective');
    }

    // Rule 5: High confidence average → assertive
    if (stats.avg_confidence > 0.8) {
        modifiers.push('assertive');
    }

    // Rule 6: Low confidence average → cautious
    if (stats.avg_confidence < 0.6 && stats.total >= 10) {
        modifiers.push('cautious');
    }

    // Rule 7: Diverse tags → broad-perspective
    if (stats.tags.size > 10) {
        modifiers.push('broad-perspective');
    }

    // Rule 8: Preference-heavy → opinionated
    if (stats.preference_count / stats.total > 0.25) {
        modifiers.push('opinionated');
    }

    // Cap at 3 modifiers
    const result = modifiers.slice(0, 3);

    voiceModifierCache.set(agentId, {
        modifiers: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return result;
}

export function clearVoiceModifierCache(): void {
    voiceModifierCache.clear();
}

async function aggregateMemoryStats(agentId: string): Promise<MemoryStats> {
    const rows = await sql<
        { type: string; confidence: number; tags: string[] }[]
    >`
        SELECT type, confidence, tags FROM ops_agent_memory
        WHERE agent_id = ${agentId}
        AND superseded_by IS NULL
        AND confidence >= 0.55
    `;

    const stats: MemoryStats = {
        total: rows.length,
        insight_count: 0,
        pattern_count: 0,
        strategy_count: 0,
        preference_count: 0,
        lesson_count: 0,
        top_tags: [],
        tags: new Map<string, number>(),
        avg_confidence: 0,
    };

    if (rows.length === 0) return stats;

    let confidenceSum = 0;

    for (const row of rows) {
        confidenceSum += Number(row.confidence);

        switch (row.type) {
            case 'insight':
                stats.insight_count++;
                break;
            case 'pattern':
                stats.pattern_count++;
                break;
            case 'strategy':
                stats.strategy_count++;
                break;
            case 'preference':
                stats.preference_count++;
                break;
            case 'lesson':
                stats.lesson_count++;
                break;
        }

        for (const tag of row.tags ?? []) {
            stats.tags.set(tag, (stats.tags.get(tag) ?? 0) + 1);
        }
    }

    stats.avg_confidence = confidenceSum / rows.length;

    // Sort tags by frequency, get top 10
    stats.top_tags = [...stats.tags.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag]) => tag);

    return stats;
}
