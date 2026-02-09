// Memory Enrichment — influence topic selection with agent memories
// 30% chance that a proactive trigger's topic gets adjusted based on past memories.
// This makes agents gradually specialize and avoid repeating mistakes.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryCache, MemoryEnrichmentResult } from '../types';
import { getCachedMemories } from './memory';

const ENRICHMENT_PROBABILITY = 0.3;

/**
 * Possibly enrich a trigger topic with agent memory.
 *
 * 70% of the time: returns baseTopic unchanged.
 * 30% of the time: queries agent's strategy/lesson memories,
 * looks for keyword overlap with available topics, and returns
 * the best match.
 */
export async function enrichTopicWithMemory(
    sb: SupabaseClient,
    agentId: string,
    baseTopic: string,
    allTopics: string[],
    cache: MemoryCache,
): Promise<MemoryEnrichmentResult> {
    // 70% — no enrichment
    if (Math.random() > ENRICHMENT_PROBABILITY) {
        return { topic: baseTopic, memoryInfluenced: false };
    }

    // Query strategy + lesson memories for this agent
    const memories = await getCachedMemories(
        sb,
        cache,
        agentId,
        ['strategy', 'lesson'],
        10,
        0.6,
    );

    if (!memories.length) {
        return { topic: baseTopic, memoryInfluenced: false };
    }

    // Try to find a relevant topic from memories
    for (const mem of memories) {
        const contentLower = mem.content.toLowerCase();

        // Check if any memory keywords match available topics
        for (const candidate of allTopics) {
            if (candidate === baseTopic) continue; // Don't match self

            const candidateLower = candidate.toLowerCase();
            const candidateWords = candidateLower.split(/\s+/);

            // Check if memory content references this topic
            const overlap = candidateWords.some(
                word => word.length > 3 && contentLower.includes(word),
            );

            if (overlap) {
                console.log(
                    `[memory-enrichment] ${agentId}: "${baseTopic}" → "${candidate}" (influenced by memory: "${mem.content.substring(0, 60)}...")`,
                );
                return {
                    topic: candidate,
                    memoryInfluenced: true,
                    memoryId: mem.id,
                };
            }
        }

        // Check if memory tags match any topic
        for (const tag of mem.tags) {
            const tagLower = tag.toLowerCase();
            for (const candidate of allTopics) {
                if (candidate === baseTopic) continue;
                if (candidate.toLowerCase().includes(tagLower)) {
                    console.log(
                        `[memory-enrichment] ${agentId}: "${baseTopic}" → "${candidate}" (tag match: "${tag}")`,
                    );
                    return {
                        topic: candidate,
                        memoryInfluenced: true,
                        memoryId: mem.id,
                    };
                }
            }
        }
    }

    // No good match found — stick with original
    return { topic: baseTopic, memoryInfluenced: false };
}
