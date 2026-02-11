// Daily conversation schedule — 24-hour office life with probability weighting
// The heartbeat checks the current UTC hour and may enqueue a conversation.
// All times are stored as UTC but designed around Central Time (UTC-6).
// Primus is the office manager — present in key operational meetings.
import type { AgentId, ScheduleSlot } from '../types';
import { AGENT_IDS } from '../agents';

/**
 * Pick N random agents from the full roster.
 */
function pickRandom(count: number): AgentId[] {
    const shuffled = [...AGENT_IDS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Pick 3 random agents — the standard "grab some coworkers" selection.
 */
function threeRandom(): AgentId[] {
    return pickRandom(3);
}

/**
 * Ensure specific agents are included, fill remaining slots randomly.
 * Deduplicates and caps at maxCount.
 */
function withRequired(
    required: AgentId[],
    fillCount: number,
    maxCount: number,
): AgentId[] {
    const pool = AGENT_IDS.filter(id => !required.includes(id));
    const shuffled = pool.sort(() => Math.random() - 0.5);
    const filled = [...required, ...shuffled.slice(0, fillCount)];
    return [...new Set(filled)].slice(0, maxCount);
}

/** Convert Central Time hour (0-23) to UTC hour. CST = UTC-6. */
function cst(hour: number): number {
    return (hour + 6) % 24;
}

/**
 * Build the full daily schedule.
 * Called fresh each time so random participant selection is dynamic.
 *
 * All times below are Central Time (converted to UTC via cst()).
 *
 * Schedule philosophy:
 * - Morning: structured ops (standup, triage, planning) — Primus leads
 * - Midday: deep work (analysis, strategy, writing)
 * - Afternoon: creative + adversarial (debate, brainstorm, cross-exam)
 * - Evening: reflective + social (retro, watercooler, content review)
 * - Night: manager's briefing, shipping review
 */
export function getDailySchedule(): ScheduleSlot[] {
    return [
        // ─── 12 AM - 5 AM CST — Graveyard (minimal) ───

        {
            hour_utc: cst(1), // 1 AM CST
            name: 'Late Night Watercooler',
            format: 'watercooler',
            participants: pickRandom(2),
            probability: 0.25,
        },
        {
            hour_utc: cst(3), // 3 AM CST
            name: 'Insomnia Check-in',
            format: 'checkin',
            participants: pickRandom(2),
            probability: 0.15,
        },

        // ─── 6 AM - 8 AM CST — Morning Ops (Primus runs these) ───

        {
            hour_utc: cst(6), // 6 AM CST
            name: 'Morning Standup',
            format: 'standup',
            participants: [...AGENT_IDS], // everyone, Primus chairs
            probability: 1.0,
        },
        {
            hour_utc: cst(7), // 7 AM CST
            name: 'Morning Triage',
            format: 'triage',
            participants: withRequired(['chora', 'subrosa', 'mux'], 1, 4),
            probability: 0.7,
        },
        {
            hour_utc: cst(8), // 8 AM CST
            name: 'Daily Planning',
            format: 'planning',
            participants: withRequired(['primus', 'praxis', 'mux'], 1, 5),
            probability: 0.6,
        },

        // ─── 9 AM - 12 PM CST — Deep Work Morning ───

        {
            hour_utc: cst(9), // 9 AM CST
            name: 'Deep Dive',
            format: 'deep_dive',
            participants: withRequired(['chora'], 2, 4),
            probability: 0.5,
        },
        {
            hour_utc: cst(10), // 10 AM CST
            name: 'Strategy Session',
            format: 'strategy',
            participants: withRequired(['primus', 'chora', 'praxis'], 1, 5),
            probability: 0.45,
        },
        {
            hour_utc: cst(11), // 11 AM CST
            name: 'Writing Room',
            format: 'writing_room',
            participants: withRequired(['chora'], 1, 3),
            probability: 0.4,
        },

        // ─── 12 PM - 1 PM CST — Midday Break ───

        {
            hour_utc: cst(12), // 12 PM CST
            name: 'Lunch Watercooler',
            format: 'watercooler',
            participants: threeRandom(),
            probability: 0.7,
        },
        {
            hour_utc: cst(13), // 1 PM CST
            name: 'Midday Check-in',
            format: 'checkin',
            participants: withRequired(['primus'], 2, 4),
            probability: 0.5,
        },

        // ─── 2 PM - 5 PM CST — Afternoon Creative + Adversarial ───

        {
            hour_utc: cst(14), // 2 PM CST
            name: 'Afternoon Brainstorm',
            format: 'brainstorm',
            participants: withRequired(['thaum'], 2, 4),
            probability: 0.5,
        },
        {
            hour_utc: cst(15), // 3 PM CST
            name: 'Debate Hour',
            format: 'debate',
            participants: withRequired(['thaum'], 1, 3),
            probability: 0.55,
        },
        {
            hour_utc: cst(16), // 4 PM CST
            name: 'Cross-Examination',
            format: 'cross_exam',
            participants: withRequired(['subrosa'], 1, 3),
            probability: 0.35,
        },
        {
            hour_utc: cst(17), // 5 PM CST
            name: 'Risk Review',
            format: 'risk_review',
            participants: withRequired(['subrosa', 'chora'], 1, 4),
            probability: 0.4,
        },

        // ─── 6 PM - 8 PM CST — Evening Wind-Down ───

        {
            hour_utc: cst(18), // 6 PM CST
            name: 'Content Review',
            format: 'content_review',
            participants: withRequired(['subrosa'], 1, 3),
            probability: 0.45,
        },
        {
            hour_utc: cst(19), // 7 PM CST
            name: 'Reframe Session',
            format: 'reframe',
            participants: withRequired(['thaum'], 1, 3),
            probability: 0.35,
        },
        {
            hour_utc: cst(20), // 8 PM CST
            name: 'Evening Watercooler',
            format: 'watercooler',
            participants: threeRandom(),
            probability: 0.6,
        },

        // ─── 9 PM - 11 PM CST — Night Wrap-Up ───

        {
            hour_utc: cst(21), // 9 PM CST
            name: 'Evening Retro',
            format: 'retro',
            participants: withRequired(['primus', 'chora'], 2, 5),
            probability: 0.4,
        },
        {
            hour_utc: cst(22), // 10 PM CST
            name: "Manager's Briefing",
            format: 'strategy',
            participants: withRequired(['primus', 'chora', 'praxis'], 1, 5),
            probability: 0.5,
        },
        {
            hour_utc: cst(23), // 11 PM CST
            name: 'Shipping Review',
            format: 'shipping',
            participants: withRequired(['praxis', 'subrosa'], 1, 4),
            probability: 0.3,
        },
    ];
}

/**
 * Get the schedule slot that matches the current UTC hour, if any.
 */
export function getSlotForHour(hourUtc: number): ScheduleSlot | undefined {
    const schedule = getDailySchedule();
    return schedule.find(slot => slot.hour_utc === hourUtc);
}

/**
 * Check if a slot should fire based on its probability.
 */
export function shouldSlotFire(slot: ScheduleSlot): boolean {
    return Math.random() < slot.probability;
}
