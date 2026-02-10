// Daily conversation schedule — 24-hour office life with probability weighting
// The heartbeat checks the current hour and may enqueue a conversation.
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

/**
 * Build the full daily schedule.
 * Called fresh each time so random participant selection is dynamic.
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
        // ─── 00:00-05:00 — Graveyard (minimal) ───

        {
            hour_utc: 1,
            name: 'Late Night Watercooler',
            format: 'watercooler',
            participants: pickRandom(2),
            probability: 0.25,
        },
        {
            hour_utc: 3,
            name: 'Insomnia Check-in',
            format: 'checkin',
            participants: pickRandom(2),
            probability: 0.15,
        },

        // ─── 06:00-08:00 — Morning Ops (Primus runs these) ───

        {
            hour_utc: 6,
            name: 'Morning Standup',
            format: 'standup',
            participants: [...AGENT_IDS], // everyone, Primus chairs
            probability: 1.0,
        },
        {
            hour_utc: 7,
            name: 'Morning Triage',
            format: 'triage',
            participants: withRequired(['chora', 'subrosa', 'mux'], 1, 4),
            probability: 0.7,
        },
        {
            hour_utc: 8,
            name: 'Daily Planning',
            format: 'planning',
            participants: withRequired(['primus', 'praxis', 'mux'], 1, 5),
            probability: 0.6,
        },

        // ─── 09:00-12:00 — Deep Work Morning ───

        {
            hour_utc: 9,
            name: 'Deep Dive',
            format: 'deep_dive',
            participants: withRequired(['chora'], 2, 4),
            probability: 0.5,
        },
        {
            hour_utc: 10,
            name: 'Strategy Session',
            format: 'strategy',
            participants: withRequired(['primus', 'chora', 'praxis'], 1, 5),
            probability: 0.45,
        },
        {
            hour_utc: 11,
            name: 'Writing Room',
            format: 'writing_room',
            participants: withRequired(['chora'], 1, 3),
            probability: 0.4,
        },

        // ─── 12:00-13:00 — Midday Break ───

        {
            hour_utc: 12,
            name: 'Lunch Watercooler',
            format: 'watercooler',
            participants: threeRandom(),
            probability: 0.7,
        },
        {
            hour_utc: 13,
            name: 'Midday Check-in',
            format: 'checkin',
            participants: withRequired(['primus'], 2, 4),
            probability: 0.5,
        },

        // ─── 14:00-17:00 — Afternoon Creative + Adversarial ───

        {
            hour_utc: 14,
            name: 'Afternoon Brainstorm',
            format: 'brainstorm',
            participants: withRequired(['thaum'], 2, 4),
            probability: 0.5,
        },
        {
            hour_utc: 15,
            name: 'Debate Hour',
            format: 'debate',
            participants: withRequired(['thaum'], 1, 3),
            probability: 0.55,
        },
        {
            hour_utc: 16,
            name: 'Cross-Examination',
            format: 'cross_exam',
            participants: withRequired(['subrosa'], 1, 3),
            probability: 0.35,
        },
        {
            hour_utc: 17,
            name: 'Risk Review',
            format: 'risk_review',
            participants: withRequired(['subrosa', 'chora'], 1, 4),
            probability: 0.4,
        },

        // ─── 18:00-20:00 — Evening Wind-Down ───

        {
            hour_utc: 18,
            name: 'Content Review',
            format: 'content_review',
            participants: withRequired(['subrosa'], 1, 3),
            probability: 0.45,
        },
        {
            hour_utc: 19,
            name: 'Reframe Session',
            format: 'reframe',
            participants: withRequired(['thaum'], 1, 3),
            probability: 0.35,
        },
        {
            hour_utc: 20,
            name: 'Evening Watercooler',
            format: 'watercooler',
            participants: threeRandom(),
            probability: 0.6,
        },

        // ─── 21:00-23:00 — Night Wrap-Up ───

        {
            hour_utc: 21,
            name: 'Evening Retro',
            format: 'retro',
            participants: withRequired(['primus', 'chora'], 2, 5),
            probability: 0.4,
        },
        {
            hour_utc: 22,
            name: "Manager's Briefing",
            format: 'strategy',
            participants: withRequired(['primus', 'chora', 'praxis'], 1, 5),
            probability: 0.5,
        },
        {
            hour_utc: 23,
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
