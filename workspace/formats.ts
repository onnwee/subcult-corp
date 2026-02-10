// lib/subcult-office/formats.ts
// 16 conversation formats for the Subcult office.
// Notes:
// - temperature is a per-thread default (override per format if needed).
// - coordinatorRole determines who opens (you map role -> agent via router).
// - min/max agents and turns are guardrails; your runtime can sample within range.

export type FormatKey =
    | 'standup'
    | 'checkin'
    | 'triage'
    | 'deep_dive'
    | 'risk_review'
    | 'strategy'
    | 'planning'
    | 'shipping'
    | 'retro'
    | 'debate'
    | 'cross_exam'
    | 'brainstorm'
    | 'reframe'
    | 'writing_room'
    | 'content_review'
    | 'watercooler';

export type CoordinatorRole =
    | 'praxis' // action/commitment lead
    | 'chora' // diagnosis/legibility lead
    | 'subrosa' // risk/protection lead
    | 'thaum' // reframing lead
    | 'mux' // ops lead
    | 'primus'; // sovereign (rare)

export type ConversationFormat = {
    minAgents: number;
    maxAgents: number;
    minTurns: number;
    maxTurns: number;
    temperature: number;
    coordinatorRole: CoordinatorRole;
    purpose: string;
    // optional knobs
    requires?: Partial<Record<CoordinatorRole, boolean>>; // required roles present
    optional?: Partial<Record<CoordinatorRole, boolean>>; // roles preferred
};

export const FORMATS: Record<FormatKey, ConversationFormat> = {
    // ---- Core trio (your starting set) ----
    standup: {
        minAgents: 4,
        maxAgents: 6,
        minTurns: 6,
        maxTurns: 12,
        temperature: 0.6,
        coordinatorRole: 'praxis',
        purpose: 'Align priorities, surface blockers, commit next actions.',
        requires: { praxis: true },
        optional: { chora: true, subrosa: true, mux: true, thaum: true },
    },

    debate: {
        minAgents: 2,
        maxAgents: 3,
        minTurns: 6,
        maxTurns: 10,
        temperature: 0.8,
        coordinatorRole: 'chora',
        purpose:
            'Force disagreements into the open to resolve or refine the frame.',
        requires: { chora: true },
        optional: { subrosa: true, thaum: true, praxis: true },
    },

    watercooler: {
        minAgents: 2,
        maxAgents: 3,
        minTurns: 2,
        maxTurns: 5,
        temperature: 0.9,
        coordinatorRole: 'mux',
        purpose: 'Low-stakes chatter that often yields unexpected insights.',
        requires: { mux: true },
        optional: { thaum: true, chora: true },
    },

    // ---- Practical operating formats ----
    checkin: {
        minAgents: 2,
        maxAgents: 4,
        minTurns: 4,
        maxTurns: 8,
        temperature: 0.55,
        coordinatorRole: 'praxis',
        purpose:
            'Mid-cycle status update: confirm progress, adjust plan, unblock.',
        requires: { praxis: true },
        optional: { mux: true, chora: true, subrosa: true },
    },

    triage: {
        minAgents: 3,
        maxAgents: 5,
        minTurns: 6,
        maxTurns: 12,
        temperature: 0.5,
        coordinatorRole: 'subrosa',
        purpose:
            'Sort issues by risk/impact; decide what must be contained first.',
        requires: { subrosa: true },
        optional: { praxis: true, chora: true, mux: true },
    },

    deep_dive: {
        minAgents: 2,
        maxAgents: 4,
        minTurns: 8,
        maxTurns: 16,
        temperature: 0.45,
        coordinatorRole: 'chora',
        purpose:
            'Extended analysis to map systems, incentives, and failure modes.',
        requires: { chora: true },
        optional: { subrosa: true, thaum: true },
    },

    risk_review: {
        minAgents: 2,
        maxAgents: 4,
        minTurns: 6,
        maxTurns: 12,
        temperature: 0.4,
        coordinatorRole: 'subrosa',
        purpose:
            'Evaluate exposure, adversaries, legal/reputation risks; issue vetoes if needed.',
        requires: { subrosa: true },
        optional: { chora: true, praxis: true },
    },

    strategy: {
        minAgents: 3,
        maxAgents: 5,
        minTurns: 6,
        maxTurns: 14,
        temperature: 0.55,
        coordinatorRole: 'chora',
        purpose:
            'Set direction, define constraints, choose the next battlefield.',
        requires: { chora: true },
        optional: { subrosa: true, praxis: true, thaum: true },
    },

    planning: {
        minAgents: 3,
        maxAgents: 5,
        minTurns: 6,
        maxTurns: 12,
        temperature: 0.5,
        coordinatorRole: 'praxis',
        purpose:
            'Translate strategy into scoped tasks, owners, and checkpoints.',
        requires: { praxis: true },
        optional: { mux: true, chora: true, subrosa: true },
    },

    shipping: {
        minAgents: 2,
        maxAgents: 4,
        minTurns: 4,
        maxTurns: 10,
        temperature: 0.45,
        coordinatorRole: 'praxis',
        purpose:
            'Finalize deliverables, define “done,” and push to completion.',
        requires: { praxis: true },
        optional: { mux: true, subrosa: true },
    },

    retro: {
        minAgents: 3,
        maxAgents: 6,
        minTurns: 6,
        maxTurns: 14,
        temperature: 0.5,
        coordinatorRole: 'chora',
        purpose: 'Postmortem: extract lessons, update memory, prevent repeats.',
        requires: { chora: true },
        optional: { praxis: true, mux: true, subrosa: true, thaum: true },
    },

    // ---- Dramatic / adversarial formats ----
    cross_exam: {
        minAgents: 2,
        maxAgents: 3,
        minTurns: 6,
        maxTurns: 12,
        temperature: 0.7,
        coordinatorRole: 'subrosa',
        purpose:
            'Interrogate assumptions for hidden risks and adversarial angles.',
        requires: { subrosa: true },
        optional: { chora: true, praxis: true },
    },

    // ---- Creative / frame-shift formats ----
    brainstorm: {
        minAgents: 3,
        maxAgents: 6,
        minTurns: 5,
        maxTurns: 12,
        temperature: 0.85,
        coordinatorRole: 'thaum',
        purpose:
            'Generate options quickly; prioritize novelty within constraints.',
        requires: { thaum: true },
        optional: { chora: true, praxis: true },
    },

    reframe: {
        minAgents: 2,
        maxAgents: 4,
        minTurns: 6,
        maxTurns: 12,
        temperature: 0.8,
        coordinatorRole: 'thaum',
        purpose:
            'Break stuck loops by proposing alternative frames and experiments.',
        requires: { thaum: true },
        optional: { chora: true, subrosa: true },
    },

    // ---- Production / comms formats ----
    writing_room: {
        minAgents: 2,
        maxAgents: 4,
        minTurns: 6,
        maxTurns: 14,
        temperature: 0.65,
        coordinatorRole: 'mux',
        purpose:
            'Turn ideas into clean artifacts: docs, posts, scripts, drafts.',
        requires: { mux: true },
        optional: { chora: true, subrosa: true },
    },

    content_review: {
        minAgents: 2,
        maxAgents: 4,
        minTurns: 5,
        maxTurns: 12,
        temperature: 0.55,
        coordinatorRole: 'subrosa',
        purpose:
            'Review public-facing content for risk, clarity, and alignment.',
        requires: { subrosa: true },
        optional: { chora: true, mux: true, praxis: true },
    },
};
