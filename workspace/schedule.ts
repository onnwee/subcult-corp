// lib/subcult-office/schedule.ts
// 24 UTC slots (0–23). If you want this to align to America/Chicago locally,
// keep hour_utc and convert at runtime.
// Conventions:
// - `...threeRandom` means "pick 3 from the eligible pool" (you implement).
// - Primus is rare and only appears in high-level slots.
// - Router is not a participant (coordination primitive), so it’s excluded.

export type OfficeSlot = {
    hour_utc: number;
    name: string;
    format:
        | 'standup'
        | 'brainstorm'
        | 'strategy'
        | 'planning'
        | 'deep_dive'
        | 'risk_review'
        | 'content_review'
        | 'writing_room'
        | 'ops'
        | 'shipping'
        | 'debate'
        | 'watercooler'
        | 'retro'
        | 'night_brief'
        | 'deep_discussion'
        | 'handoff'
        | 'maintenance'
        | 'intel_scan';
    participants: string[];
    probability: number; // 0.0–1.0
};

const core = ['chora', 'subrosa', 'thaum', 'praxis', 'mux'] as const;
const eligible = [...core]; // exclude primus by default

export const SUBCULT_OFFICE_SCHEDULE: OfficeSlot[] = [
    {
        hour_utc: 0,
        name: 'Night Shift Handoff',
        format: 'handoff',
        participants: ['mux', 'praxis', ...threeRandom(eligible)],
        probability: 0.6,
    },
    {
        hour_utc: 1,
        name: 'Deep Discussion',
        format: 'deep_discussion',
        participants: ['chora', 'thaum', ...threeRandom(eligible)],
        probability: 0.45,
    },
    {
        hour_utc: 2,
        name: 'Threat Model Pass',
        format: 'risk_review',
        participants: ['subrosa', 'chora', ...threeRandom(eligible)],
        probability: 0.55,
    },
    {
        hour_utc: 3,
        name: 'Quiet Ops Queue',
        format: 'ops',
        participants: ['mux', ...threeRandom(eligible)],
        probability: 0.7,
    },
    {
        hour_utc: 4,
        name: 'Maintenance Window',
        format: 'maintenance',
        participants: ['mux', 'praxis', ...threeRandom(eligible)],
        probability: 0.5,
    },
    {
        hour_utc: 5,
        name: 'Intel Scan',
        format: 'intel_scan',
        participants: ['chora', 'subrosa', ...threeRandom(eligible)],
        probability: 0.6,
    },

    // Morning block (standup always)
    {
        hour_utc: 6,
        name: 'Morning Standup',
        format: 'standup',
        participants: ['praxis', 'mux', 'chora', 'subrosa', 'thaum'],
        probability: 1.0,
    },
    {
        hour_utc: 7,
        name: 'Morning Brainstorm',
        format: 'brainstorm',
        participants: ['thaum', 'chora', ...threeRandom(eligible)],
        probability: 0.8,
    },
    {
        hour_utc: 8,
        name: 'Strategy Session',
        format: 'strategy',
        participants: ['praxis', 'chora', 'subrosa', ...threeRandom(eligible)],
        probability: 0.7,
    },
    {
        hour_utc: 9,
        name: 'Planning & Scoping',
        format: 'planning',
        participants: ['praxis', 'mux', ...threeRandom(eligible)],
        probability: 0.65,
    },
    {
        hour_utc: 10,
        name: 'Risk + Exposure Check',
        format: 'risk_review',
        participants: ['subrosa', 'praxis', ...threeRandom(eligible)],
        probability: 0.6,
    },
    {
        hour_utc: 11,
        name: 'Writing Room',
        format: 'writing_room',
        participants: ['chora', 'mux', ...threeRandom(eligible)],
        probability: 0.55,
    },

    // Afternoon block
    {
        hour_utc: 12,
        name: 'Deep-Dive Analysis',
        format: 'deep_dive',
        participants: ['chora', ...threeRandom(eligible)],
        probability: 0.75,
    },
    {
        hour_utc: 13,
        name: 'Deep-Dive (Alt Frame)',
        format: 'deep_dive',
        participants: ['thaum', 'chora', ...threeRandom(eligible)],
        probability: 0.55,
    },
    {
        hour_utc: 14,
        name: 'Midday Check-in',
        format: 'standup',
        participants: ['praxis', 'mux', ...threeRandom(eligible)],
        probability: 0.6,
    },
    {
        hour_utc: 15,
        name: 'Content Review',
        format: 'content_review',
        participants: ['subrosa', 'chora', 'mux', ...threeRandom(eligible)],
        probability: 0.65,
    },
    {
        hour_utc: 16,
        name: 'Ops + Packaging',
        format: 'ops',
        participants: ['mux', ...threeRandom(eligible)],
        probability: 0.8,
    },
    {
        hour_utc: 17,
        name: 'Ship Window',
        format: 'shipping',
        participants: ['praxis', 'mux', ...threeRandom(eligible)],
        probability: 0.7,
    },

    // Evening block
    {
        hour_utc: 18,
        name: 'Watercooler Chat',
        format: 'watercooler',
        participants: [...threeRandom(eligible)],
        probability: 0.6,
    },
    {
        hour_utc: 19,
        name: 'Debate Club',
        format: 'debate',
        participants: ['chora', 'thaum', 'subrosa', ...threeRandom(eligible)],
        probability: 0.5,
    },
    {
        hour_utc: 20,
        name: 'Night Briefing',
        format: 'night_brief',
        participants: ['praxis', 'chora', 'subrosa', ...threeRandom(eligible)],
        probability: 0.65,
    },
    {
        hour_utc: 21,
        name: 'Retro / Postmortem',
        format: 'retro',
        participants: ['chora', 'praxis', 'mux', ...threeRandom(eligible)],
        probability: 0.5,
    },
    {
        hour_utc: 22,
        name: 'Long-Range Alignment',
        format: 'strategy',
        participants: [
            'chora',
            'subrosa',
            'praxis',
            ...threeRandom(eligible),
            'primus',
        ],
        probability: 0.25,
    },
    {
        hour_utc: 23,
        name: 'Late Night Deep Talk',
        format: 'deep_discussion',
        participants: ['thaum', 'chora', ...threeRandom(eligible)],
        probability: 0.4,
    },
];

// ---------- helpers you implement ----------
function threeRandom(pool: readonly string[]): string[] {
    // placeholder: implement your own sampling without replacement
    return [] as any;
}
