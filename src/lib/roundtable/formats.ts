// Conversation format configurations — 16 formats for a living office
// Each format has a coordinator, purpose, participation requirements, and tuning
import type { ConversationFormat, FormatConfig } from '../types';

export const FORMATS: Record<ConversationFormat, FormatConfig> = {
    // ─── Structured Operations ───

    standup: {
        coordinatorRole: 'primus',
        purpose:
            'Daily status sync. What happened, what is blocked, what is next.',
        minAgents: 4,
        maxAgents: 6,
        minTurns: 8,
        maxTurns: 14,
        temperature: 0.5,
        requires: ['primus', 'chora', 'praxis'],
    },
    checkin: {
        coordinatorRole: 'primus',
        purpose: 'Lightweight pulse check. How is everyone? Anything urgent?',
        minAgents: 3,
        maxAgents: 5,
        minTurns: 4,
        maxTurns: 8,
        temperature: 0.6,
    },
    triage: {
        coordinatorRole: 'chora',
        purpose: 'Classify and prioritize incoming signals, tasks, or issues.',
        minAgents: 3,
        maxAgents: 4,
        minTurns: 6,
        maxTurns: 10,
        temperature: 0.5,
        requires: ['chora', 'subrosa'],
    },

    // ─── Deep Work ───

    deep_dive: {
        coordinatorRole: 'chora',
        purpose:
            'Extended analysis of a single topic. Slow, thorough, structured.',
        minAgents: 2,
        maxAgents: 4,
        minTurns: 10,
        maxTurns: 18,
        temperature: 0.6,
        requires: ['chora'],
        optional: ['thaum', 'subrosa'],
        defaultModel: 'moonshotai/kimi-k2.5',
    },
    risk_review: {
        coordinatorRole: 'subrosa',
        purpose:
            'Subrosa-led threat assessment. What could go wrong? What are we exposing?',
        minAgents: 2,
        maxAgents: 4,
        minTurns: 6,
        maxTurns: 12,
        temperature: 0.5,
        requires: ['subrosa'],
        optional: ['chora', 'praxis'],
        defaultModel: 'moonshotai/kimi-k2.5',
    },
    strategy: {
        coordinatorRole: 'primus',
        purpose: 'Medium-term direction setting. Where are we going and why?',
        minAgents: 3,
        maxAgents: 5,
        minTurns: 8,
        maxTurns: 14,
        temperature: 0.7,
        requires: ['primus', 'chora', 'praxis'],
        optional: ['subrosa'],
        defaultModel: 'moonshotai/kimi-k2.5',
    },

    // ─── Execution ───

    planning: {
        coordinatorRole: 'primus',
        purpose: 'Turn strategy into concrete tasks with owners and deadlines.',
        minAgents: 3,
        maxAgents: 5,
        minTurns: 6,
        maxTurns: 12,
        temperature: 0.5,
        requires: ['primus', 'praxis', 'mux'],
    },
    shipping: {
        coordinatorRole: 'praxis',
        purpose:
            'Pre-ship review. Is it ready? What needs to happen before launch?',
        minAgents: 3,
        maxAgents: 5,
        minTurns: 6,
        maxTurns: 10,
        temperature: 0.5,
        requires: ['praxis', 'subrosa'],
        optional: ['mux'],
        defaultModel: 'moonshotai/kimi-k2.5',
    },
    retro: {
        coordinatorRole: 'primus',
        purpose: "Post-mortem. What worked, what didn't, what do we change?",
        minAgents: 3,
        maxAgents: 6,
        minTurns: 8,
        maxTurns: 14,
        temperature: 0.7,
        requires: ['primus', 'chora'],
    },

    // ─── Adversarial / Creative ───

    debate: {
        coordinatorRole: 'thaum',
        purpose:
            'Structured disagreement. Two or more positions tested against each other.',
        minAgents: 2,
        maxAgents: 4,
        minTurns: 6,
        maxTurns: 12,
        temperature: 0.85,
        requires: ['thaum'],
    },
    cross_exam: {
        coordinatorRole: 'subrosa',
        purpose:
            'Adversarial interrogation of a proposal or assumption. Stress-test it.',
        minAgents: 2,
        maxAgents: 3,
        minTurns: 6,
        maxTurns: 10,
        temperature: 0.8,
        requires: ['subrosa'],
        optional: ['chora'],
    },
    brainstorm: {
        coordinatorRole: 'thaum',
        purpose:
            'Divergent ideation. No bad ideas (yet). Build volume before filtering.',
        minAgents: 2,
        maxAgents: 4,
        minTurns: 6,
        maxTurns: 12,
        temperature: 0.95,
        requires: ['thaum'],
    },
    reframe: {
        coordinatorRole: 'thaum',
        purpose: "The current frame isn't working. Break it. Find a new one.",
        minAgents: 2,
        maxAgents: 3,
        minTurns: 4,
        maxTurns: 8,
        temperature: 0.9,
        requires: ['thaum'],
        optional: ['chora'],
    },

    // ─── Content ───

    writing_room: {
        coordinatorRole: 'chora',
        purpose: 'Collaborative drafting. Work on a piece of writing together.',
        minAgents: 2,
        maxAgents: 4,
        minTurns: 8,
        maxTurns: 16,
        temperature: 0.7,
        requires: ['chora'],
        optional: ['mux'],
        defaultModel: 'moonshotai/kimi-k2.5',
    },
    content_review: {
        coordinatorRole: 'subrosa',
        purpose: 'Review existing content for quality, risk, and alignment.',
        minAgents: 2,
        maxAgents: 4,
        minTurns: 6,
        maxTurns: 10,
        temperature: 0.6,
        requires: ['subrosa'],
        optional: ['chora', 'praxis'],
    },

    // ─── Social ───

    watercooler: {
        coordinatorRole: 'mux',
        purpose: 'Unstructured chat. Relationship building. The vibe.',
        minAgents: 2,
        maxAgents: 4,
        minTurns: 3,
        maxTurns: 6,
        temperature: 0.95,
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
