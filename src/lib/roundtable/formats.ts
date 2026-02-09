// Conversation format configurations
// Start with 3 formats: standup, debate, watercooler
import type { ConversationFormat, FormatConfig } from '../types';

export const FORMATS: Record<ConversationFormat, FormatConfig> = {
    standup: {
        minAgents: 3,
        maxAgents: 3,
        minTurns: 6,
        maxTurns: 12,
        temperature: 0.6,
    },
    debate: {
        minAgents: 2,
        maxAgents: 3,
        minTurns: 6,
        maxTurns: 10,
        temperature: 0.8,
    },
    watercooler: {
        minAgents: 2,
        maxAgents: 3,
        minTurns: 2,
        maxTurns: 5,
        temperature: 0.9,
    },
};

export function getFormat(name: ConversationFormat): FormatConfig {
    return FORMATS[name];
}

/**
 * Pick a random turn count within the format's range.
 */
export function pickTurnCount(format: FormatConfig): number {
    return (
        format.minTurns +
        Math.floor(Math.random() * (format.maxTurns - format.minTurns + 1))
    );
}
