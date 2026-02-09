// Daily conversation schedule — 24-hour slots with probability weighting
// The heartbeat checks the current hour and may enqueue a conversation
import type { ScheduleSlot } from '../types';
import { AGENT_IDS } from '../agents';

/**
 * Pick N random agents from the full roster.
 */
function pickRandom(count: number): string[] {
    const shuffled = [...AGENT_IDS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

/**
 * Build the full daily schedule.
 * Called fresh each time so random participant selection is dynamic.
 */
export function getDailySchedule(): ScheduleSlot[] {
    return [
        // ─── Morning ───
        {
            hour_utc: 6,
            name: 'Morning Standup',
            format: 'standup',
            participants: [...AGENT_IDS], // all agents
            probability: 1.0, // happens every day
        },
        {
            hour_utc: 8,
            name: 'Morning Brainstorm',
            format: 'debate',
            participants: pickRandom(2),
            probability: 0.6,
        },

        // ─── Midday ───
        {
            hour_utc: 10,
            name: 'Strategy Session',
            format: 'debate',
            participants: ['opus', ...pickRandom(2)].filter(
                (v, i, a) => a.indexOf(v) === i,
            ), // opus + 1-2 random (deduped)
            probability: 0.5,
        },
        {
            hour_utc: 12,
            name: 'Lunch Watercooler',
            format: 'watercooler',
            participants: pickRandom(2),
            probability: 0.7,
        },

        // ─── Afternoon ───
        {
            hour_utc: 14,
            name: 'Afternoon Check-in',
            format: 'standup',
            participants: [...AGENT_IDS],
            probability: 0.5,
        },
        {
            hour_utc: 16,
            name: 'Content Review',
            format: 'debate',
            participants: ['brain', 'observer'],
            probability: 0.4,
        },

        // ─── Evening ───
        {
            hour_utc: 18,
            name: 'Evening Watercooler',
            format: 'watercooler',
            participants: pickRandom(2),
            probability: 0.6,
        },
        {
            hour_utc: 20,
            name: 'Evening Debate',
            format: 'debate',
            participants: pickRandom(2),
            probability: 0.4,
        },

        // ─── Night ───
        {
            hour_utc: 22,
            name: 'Night Briefing',
            format: 'standup',
            participants: [...AGENT_IDS],
            probability: 0.4,
        },
        {
            hour_utc: 0,
            name: 'Late Night Chat',
            format: 'watercooler',
            participants: pickRandom(2),
            probability: 0.4,
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
