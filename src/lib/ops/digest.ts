// Daily Digest — gather daily activity and generate a narrative summary as Mux
// Phase 6: Daily Digest & Reporting

import { sql, jsonb } from '@/lib/db';
import { llmGenerate } from '@/lib/llm/client';
import { getVoice } from '@/lib/roundtable/voices';
import { emitEvent } from '@/lib/ops/events';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'digest' });

// ─── Types ───

export interface DigestHighlight {
    title: string;
    description: string;
    agentId?: string;
    eventId?: string;
}

export interface DigestStats {
    events: number;
    conversations: number;
    missions_succeeded: number;
    missions_failed: number;
    memories: number;
    costs: number;
}

export interface DailyDigest {
    id: string;
    digest_date: string;
    summary: string;
    highlights: DigestHighlight[];
    stats: DigestStats;
    generated_by: string;
    created_at: string;
}

// ─── Internal: gather day's data ───

interface DayData {
    eventCounts: Record<string, number>;
    sessions: { topic: string; participants: string[]; turns: number }[];
    memoriesByAgent: Record<string, number>;
    missionOutcomes: { succeeded: number; failed: number };
    totalCost: number;
    topEvents: { id: string; agent_id: string; title: string; kind: string }[];
}

async function gatherDayData(date: Date): Promise<DayData> {
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const start = dayStart.toISOString();
    const end = dayEnd.toISOString();

    // Gather all data in parallel
    const [
        eventRows,
        sessionRows,
        memoryRows,
        missionRows,
        costRows,
        topEventRows,
    ] = await Promise.all([
        // Event counts by kind
        sql<{ kind: string; count: string }[]>`
                SELECT kind, COUNT(*)::text as count
                FROM ops_agent_events
                WHERE created_at >= ${start} AND created_at < ${end}
                GROUP BY kind
            `,

        // Completed roundtable sessions
        sql<{ topic: string; participants: string; turn_count: string }[]>`
                SELECT
                    rs.topic,
                    COALESCE(rs.participants::text, '[]') as participants,
                    COUNT(rt.id)::text as turn_count
                FROM ops_roundtable_sessions rs
                LEFT JOIN ops_roundtable_turns rt ON rt.session_id = rs.id
                WHERE rs.created_at >= ${start} AND rs.created_at < ${end}
                  AND rs.status = 'completed'
                GROUP BY rs.id, rs.topic, rs.participants
                ORDER BY rs.created_at DESC
                LIMIT 10
            `,

        // New memories by agent
        sql<{ agent_id: string; count: string }[]>`
                SELECT agent_id, COUNT(*)::text as count
                FROM ops_agent_memory
                WHERE created_at >= ${start} AND created_at < ${end}
                GROUP BY agent_id
            `,

        // Mission outcomes
        sql<{ status: string; count: string }[]>`
                SELECT status, COUNT(*)::text as count
                FROM ops_missions
                WHERE updated_at >= ${start} AND updated_at < ${end}
                  AND status IN ('succeeded', 'failed')
                GROUP BY status
            `,

        // Total cost for the day
        sql<{ total: string }[]>`
                SELECT COALESCE(SUM(cost_usd), 0)::text as total
                FROM ops_llm_usage
                WHERE created_at >= ${start} AND created_at < ${end}
            `,

        // Top notable events (for highlights extraction)
        sql<{ id: string; agent_id: string; title: string; kind: string }[]>`
                SELECT id, agent_id, title, kind
                FROM ops_agent_events
                WHERE created_at >= ${start} AND created_at < ${end}
                  AND kind NOT IN ('heartbeat', 'system')
                ORDER BY created_at DESC
                LIMIT 20
            `,
    ]);

    const eventCounts: Record<string, number> = {};
    for (const row of eventRows) {
        eventCounts[row.kind] = parseInt(row.count, 10);
    }

    const sessions = sessionRows.map(r => {
        let participants: string[] = [];
        try {
            participants = JSON.parse(r.participants);
        } catch {
            /* ignore */
        }
        return {
            topic: r.topic,
            participants,
            turns: parseInt(r.turn_count, 10),
        };
    });

    const memoriesByAgent: Record<string, number> = {};
    for (const row of memoryRows) {
        memoriesByAgent[row.agent_id] = parseInt(row.count, 10);
    }

    const missionOutcomes = { succeeded: 0, failed: 0 };
    for (const row of missionRows) {
        if (row.status === 'succeeded')
            missionOutcomes.succeeded = parseInt(row.count, 10);
        if (row.status === 'failed')
            missionOutcomes.failed = parseInt(row.count, 10);
    }

    return {
        eventCounts,
        sessions,
        memoriesByAgent,
        missionOutcomes,
        totalCost: parseFloat(costRows[0]?.total ?? '0'),
        topEvents: topEventRows,
    };
}

// ─── Public: generate and store digest ───

/**
 * Generate a daily digest for the given date (defaults to the current CST day).
 * If called after midnight CST, creates digest for the previous day.
 * Gathers activity data and asks Mux to write a narrative summary.
 * Returns the digest ID, or null if a digest already exists for that date.
 */
export async function generateDailyDigest(date?: Date): Promise<string | null> {
    let targetDate: Date;
    
    if (date) {
        // Use provided date as-is (assume it's already the correct UTC midnight)
        targetDate = date;
    } else {
        // Calculate CST date
        const now = new Date();
        const cstHour = (now.getUTCHours() - 6 + 24) % 24;
        
        // If it's past midnight CST (0:00-1:59), use yesterday's date
        // Otherwise use today's date
        const cstOffset = cstHour <= 1 ? -6 - 24 : -6;
        const cstDate = new Date(now.getTime() + cstOffset * 60 * 60 * 1000);
        
        // Extract just the date portion and create UTC midnight
        const dateStr = cstDate.toISOString().slice(0, 10);
        targetDate = new Date(dateStr + 'T00:00:00Z');
    }
    
    const dateStr = targetDate.toISOString().slice(0, 10); // YYYY-MM-DD

    // Check if digest already exists for this date
    const existing = await sql<{ id: string }[]>`
        SELECT id FROM ops_daily_digests WHERE digest_date = ${dateStr}
    `;
    if (existing.length > 0) {
        log.info('Digest already exists for date', {
            date: dateStr,
            id: existing[0].id,
        });
        return null;
    }

    log.info('Generating daily digest', { date: dateStr });

    // Gather data
    const data = await gatherDayData(targetDate);

    // Build stats
    const totalEvents = Object.values(data.eventCounts).reduce(
        (a, b) => a + b,
        0,
    );
    const totalMemories = Object.values(data.memoriesByAgent).reduce(
        (a, b) => a + b,
        0,
    );
    const stats: DigestStats = {
        events: totalEvents,
        conversations: data.sessions.length,
        missions_succeeded: data.missionOutcomes.succeeded,
        missions_failed: data.missionOutcomes.failed,
        memories: totalMemories,
        costs: Math.round(data.totalCost * 10000) / 10000,
    };

    // Build prompt for Mux
    const dataSummary = [
        `Date: ${dateStr}`,
        `Total events: ${totalEvents} (${Object.entries(data.eventCounts)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')})`,
        `Conversations completed: ${data.sessions.length}`,
        ...(data.sessions.length > 0 ?
            data.sessions
                .slice(0, 5)
                .map(
                    s =>
                        `  - "${s.topic}" (${s.participants.join(', ')}, ${s.turns} turns)`,
                )
        :   []),
        `Missions: ${data.missionOutcomes.succeeded} succeeded, ${data.missionOutcomes.failed} failed`,
        `New memories: ${totalMemories} (${Object.entries(data.memoriesByAgent)
            .map(([a, c]) => `${a}: ${c}`)
            .join(', ')})`,
        `LLM costs: $${stats.costs}`,
        '',
        'Notable events:',
        ...(data.topEvents.length > 0 ?
            data.topEvents
                .slice(0, 10)
                .map(e => `  - [${e.agent_id}/${e.kind}] ${e.title}`)
        :   ['  (none)']),
    ].join('\n');

    // Get Mux's voice
    const muxVoice = getVoice('mux');
    const systemDirective =
        muxVoice?.systemDirective ??
        'You are Mux, the operational labor agent.';

    // Generate summary via LLM
    const summary = await llmGenerate({
        messages: [
            { role: 'system', content: systemDirective },
            {
                role: 'user',
                content: `Write a brief daily summary for the collective. Be conversational, highlight what's interesting, and keep your typical dry humor. Here's today's activity data:\n\n${dataSummary}\n\nWrite a 2-4 paragraph digest. Mention specific agents by name when relevant. Note any patterns or interesting developments. If it was a quiet day, say so — don't fabricate activity.`,
            },
        ],
        temperature: 0.7,
        maxTokens: 500,
        trackingContext: { agentId: 'mux', context: 'daily_digest' },
    });

    // Extract highlights from top events
    const highlights: DigestHighlight[] = data.topEvents.slice(0, 5).map(e => ({
        title: e.title,
        description: `${e.kind} event from ${e.agent_id}`,
        agentId: e.agent_id,
        eventId: e.id,
    }));

    // Store digest
    const [inserted] = await sql<{ id: string }[]>`
        INSERT INTO ops_daily_digests (digest_date, summary, highlights, stats, generated_by)
        VALUES (${dateStr}, ${summary}, ${jsonb(highlights)}, ${jsonb(stats)}, 'mux')
        RETURNING id
    `;

    // Emit event using emitEvent helper
    await emitEvent({
        agent_id: 'mux',
        kind: 'daily_digest_generated',
        title: `Daily digest for ${dateStr}`,
        summary: summary.slice(0, 200),
        tags: ['digest', 'daily', 'mux'],
        metadata: { digest_id: inserted.id, date: dateStr, stats },
    });

    log.info('Daily digest generated', {
        date: dateStr,
        digestId: inserted.id,
        stats,
    });
    return inserted.id;
}
