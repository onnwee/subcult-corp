// Memory enrichment — enhance topics with relevant agent memories
import type {
    MemoryCache,
    MemoryEntry,
    MemoryEnrichmentResult,
} from '../types';
import { getCachedMemories } from './memory';

export async function enrichTopicWithMemory(
    agentId: string,
    topic: string,
    cache: MemoryCache,
): Promise<MemoryEnrichmentResult> {
    const memories = await getCachedMemories(agentId, cache);

    if (memories.length === 0) {
        return { topic, memoryInfluenced: false };
    }

    // Find best tag-overlap match by confidence-weighted score
    const topicWords = topic
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3);

    let bestMemory: MemoryEntry | null = null;
    let bestScore = 0;

    for (const mem of memories) {
        const tagMatches = mem.tags.filter(tag =>
            topicWords.some(
                word =>
                    tag.toLowerCase().includes(word) ||
                    word.includes(tag.toLowerCase()),
            ),
        ).length;

        // Also check content overlap
        const contentWords = mem.content
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 3);
        const contentMatches = topicWords.filter(w =>
            contentWords.some(cw => cw.includes(w) || w.includes(cw)),
        ).length;

        const score =
            (tagMatches * 2 + contentMatches) * (mem.confidence ?? 0.5);

        if (score > bestScore) {
            bestScore = score;
            bestMemory = mem;
        }
    }

    if (!bestMemory || bestScore < 0.5) {
        return { topic, memoryInfluenced: false };
    }

    const enriched = `${topic} [Memory context: ${bestMemory.content}]`;

    return {
        topic: enriched,
        memoryInfluenced: true,
        memoryId: bestMemory.id,
    };
}
