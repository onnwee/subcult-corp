// Speaker selection — weighted randomness for natural conversation flow
// Factors: affinity with last speaker, recency penalty, format coordinator, random jitter
import type { ConversationFormat, ConversationTurnEntry } from '../types';
import { getAffinityFromMap } from '../ops/relationships';
import { getFormat } from './formats';

/**
 * Calculate recency penalty — agents who've spoken more get penalized.
 * Returns 0-1 where higher = spoke more recently / more often.
 */
function recencyPenalty(
    agent: string,
    speakCounts: Record<string, number>,
    totalTurns: number,
): number {
    if (totalTurns === 0) return 0;
    const count = speakCounts[agent] ?? 0;
    return count / totalTurns;
}

/**
 * Select the first speaker based on format.
 * The format's coordinatorRole opens the conversation if they're a participant.
 * Otherwise, a random participant opens.
 */
export function selectFirstSpeaker(
    participants: string[],
    format: ConversationFormat,
): string {
    const formatConfig = getFormat(format);
    const coordinator = formatConfig.coordinatorRole;

    // Coordinator opens if they're in the room
    if (participants.includes(coordinator)) {
        return coordinator;
    }

    // Otherwise random
    return participants[Math.floor(Math.random() * participants.length)];
}

/**
 * Select the next speaker using weighted randomness.
 * Considers: affinity with last speaker (from DB), recency penalty, random jitter.
 * Never picks the same speaker back-to-back.
 */
export function selectNextSpeaker(context: {
    participants: string[];
    lastSpeaker: string;
    history: ConversationTurnEntry[];
    affinityMap?: Map<string, number>;
    format?: ConversationFormat;
}): string {
    const { participants, lastSpeaker, history, affinityMap, format } = context;

    // Count how many times each agent has spoken
    const speakCounts: Record<string, number> = {};
    for (const turn of history) {
        speakCounts[turn.speaker] = (speakCounts[turn.speaker] ?? 0) + 1;
    }

    // Calculate weights for each participant
    const weights = participants.map(agent => {
        // No back-to-back speaking
        if (agent === lastSpeaker) return 0;

        let w = 1.0;

        // Good rapport with last speaker → more likely to respond
        const affinity =
            affinityMap ?
                getAffinityFromMap(affinityMap, agent, lastSpeaker)
            :   0.5;
        w += affinity * 0.6;

        // Spoke a lot recently → lower weight
        w -= recencyPenalty(agent, speakCounts, history.length) * 0.4;

        // 20% random jitter
        w += Math.random() * 0.4 - 0.2;

        return Math.max(0, w);
    });

    return weightedRandomPick(participants, weights);
}

/**
 * Pick an item from an array using weighted probabilities.
 */
function weightedRandomPick<T>(items: T[], weights: number[]): T {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    // Fallback: if all weights are 0, pick uniformly at random
    if (totalWeight <= 0) {
        return items[Math.floor(Math.random() * items.length)];
    }

    let random = Math.random() * totalWeight;
    for (let i = 0; i < items.length; i++) {
        random -= weights[i];
        if (random <= 0) return items[i];
    }

    // Should never reach here, but fallback to last item
    return items[items.length - 1];
}
