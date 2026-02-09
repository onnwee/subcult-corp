// Voice Evolution — derive personality modifiers from accumulated memories
// No new tables: personality is computed dynamically from ops_agent_memory.
// Rule-driven (not LLM) for determinism, $0 cost, and debuggability.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryType } from '../types';

/** Per-agent modifier cache so we only query once per conversation */
const modifierCache = new Map<
    string,
    { modifiers: string[]; fetchedAt: number }
>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface MemoryStats {
    total: number;
    insight_count: number;
    pattern_count: number;
    strategy_count: number;
    preference_count: number;
    lesson_count: number;
    top_tags: string[];
    tags: string[];
    avg_confidence: number;
}

/**
 * Aggregate an agent's memory distribution from the database.
 * Returns counts per memory type, top tags, and average confidence.
 */
async function aggregateMemoryStats(
    sb: SupabaseClient,
    agentId: string,
): Promise<MemoryStats> {
    const { data: memories, error } = await sb
        .from('ops_agent_memory')
        .select('type, confidence, tags')
        .eq('agent_id', agentId)
        .is('superseded_by', null)
        .gte('confidence', 0.55);

    if (error || !memories?.length) {
        return {
            total: 0,
            insight_count: 0,
            pattern_count: 0,
            strategy_count: 0,
            preference_count: 0,
            lesson_count: 0,
            top_tags: [],
            tags: [],
            avg_confidence: 0,
        };
    }

    const typeCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    let totalConfidence = 0;

    for (const mem of memories) {
        const t = mem.type as MemoryType;
        typeCounts[t] = (typeCounts[t] ?? 0) + 1;
        totalConfidence += Number(mem.confidence);

        if (Array.isArray(mem.tags)) {
            for (const tag of mem.tags) {
                if (typeof tag === 'string' && tag !== 'conversation') {
                    tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
                }
            }
        }
    }

    // Sort tags by frequency
    const sortedTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);

    return {
        total: memories.length,
        insight_count: typeCounts['insight'] ?? 0,
        pattern_count: typeCounts['pattern'] ?? 0,
        strategy_count: typeCounts['strategy'] ?? 0,
        preference_count: typeCounts['preference'] ?? 0,
        lesson_count: typeCounts['lesson'] ?? 0,
        top_tags: sortedTags.slice(0, 5),
        tags: sortedTags,
        avg_confidence:
            memories.length > 0 ? totalConfidence / memories.length : 0,
    };
}

/**
 * Derive voice modifiers for an agent based on their accumulated memories.
 * Rule-driven — deterministic, free, and debuggable.
 *
 * Returns up to 3 modifiers that will be injected into the agent's
 * system prompt as "Personality evolution" directives.
 */
export async function deriveVoiceModifiers(
    sb: SupabaseClient,
    agentId: string,
): Promise<string[]> {
    // Check cache first
    const cached = modifierCache.get(agentId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return cached.modifiers;
    }

    const stats = await aggregateMemoryStats(sb, agentId);

    // Not enough experience yet — no modifiers
    if (stats.total < 5) {
        modifierCache.set(agentId, { modifiers: [], fetchedAt: Date.now() });
        return [];
    }

    const modifiers: string[] = [];

    // ── Engagement expertise ──
    if (stats.lesson_count > 10 && stats.tags.includes('engagement')) {
        modifiers.push('Reference what works in engagement when relevant');
    }

    // ── Content strategy expertise ──
    if (stats.pattern_count > 5 && stats.top_tags[0] === 'content') {
        modifiers.push("You've developed expertise in content strategy");
    }

    // ── Strategic thinker ──
    if (stats.strategy_count > 8) {
        modifiers.push('You think strategically about long-term plans');
    }

    // ── Data-driven ──
    if (stats.insight_count > 10 && stats.tags.includes('analytics')) {
        modifiers.push('Lead with data and numbers when making points');
    }

    // ── Pattern spotter ──
    if (stats.pattern_count > 8) {
        modifiers.push('You naturally spot patterns — mention them');
    }

    // ── Experienced learner ──
    if (stats.lesson_count > 15) {
        modifiers.push('Draw on past lessons learned when advising others');
    }

    // ── High overall confidence ──
    if (stats.avg_confidence > 0.8 && stats.total > 20) {
        modifiers.push('Speak with authority — your track record is strong');
    }

    // ── Topic specialist ──
    if (stats.top_tags.length > 0) {
        const topTag = stats.top_tags[0];
        const topTagCount =
            stats.tags.includes(topTag) ?
                // Re-count the top tag
                stats.total // We already know it's the most common
            :   0;

        if (topTagCount > 10 && !modifiers.some(m => m.includes(topTag))) {
            modifiers.push(
                `You have deep experience with ${topTag} — weave it in naturally`,
            );
        }
    }

    // ── Preference-driven ──
    if (stats.preference_count > 5) {
        modifiers.push('You have strong opinions — express them confidently');
    }

    const result = modifiers.slice(0, 3);
    modifierCache.set(agentId, { modifiers: result, fetchedAt: Date.now() });

    return result;
}

/**
 * Clear the voice modifier cache. Useful for testing or after bulk memory writes.
 */
export function clearVoiceModifierCache(): void {
    modifierCache.clear();
}
