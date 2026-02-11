// /api/ops/system — System health & activity data for the logs dashboard
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [
            recentEvents,
            sessionStats,
            errorLog,
            eventTimeline,
            agentActivity,
            memoryStats,
        ] = await Promise.all([
            // Last 100 events with full metadata
            sql`
                SELECT id, agent_id, kind, title, summary, tags, metadata, created_at
                FROM ops_agent_events
                ORDER BY created_at DESC
                LIMIT 100
            `,

            // Session stats: by status and format
            sql`
                SELECT
                    status,
                    format,
                    COUNT(*)::int as count,
                    AVG(turn_count)::int as avg_turns,
                    MAX(created_at) as last_at
                FROM ops_roundtable_sessions
                GROUP BY status, format
                ORDER BY last_at DESC
            `,

            // Recent errors: failed conversations and events with error metadata
            sql`
                SELECT id, agent_id, kind, title, summary, metadata, created_at
                FROM ops_agent_events
                WHERE kind LIKE '%failed%'
                   OR kind LIKE '%error%'
                   OR metadata->>'error' IS NOT NULL
                ORDER BY created_at DESC
                LIMIT 30
            `,

            // Event volume per hour (last 24h)
            sql`
                SELECT
                    date_trunc('hour', created_at) as hour,
                    COUNT(*)::int as count,
                    COUNT(DISTINCT agent_id)::int as agents_active
                FROM ops_agent_events
                WHERE created_at > now() - interval '24 hours'
                GROUP BY date_trunc('hour', created_at)
                ORDER BY hour ASC
            `,

            // Per-agent activity summary
            sql`
                SELECT
                    agent_id,
                    COUNT(*)::int as total_events,
                    COUNT(*) FILTER (WHERE created_at > now() - interval '1 hour')::int as events_last_hour,
                    MAX(created_at) as last_active,
                    array_agg(DISTINCT kind) as event_kinds
                FROM ops_agent_events
                GROUP BY agent_id
                ORDER BY total_events DESC
            `,

            // Memory counts per agent
            sql`
                SELECT
                    agent_id,
                    COUNT(*)::int as total,
                    COUNT(*) FILTER (WHERE superseded_by IS NULL)::int as active
                FROM ops_agent_memory
                GROUP BY agent_id
            `,
        ]);

        // Worker health: check most recent heartbeat
        const lastHeartbeat = await sql`
            SELECT created_at, metadata
            FROM ops_agent_events
            WHERE kind = 'heartbeat'
            ORDER BY created_at DESC
            LIMIT 1
        `;

        // Recent conversation outcomes
        const recentSessions = await sql`
            SELECT id, format, topic, participants, status, turn_count,
                   metadata, created_at, started_at, completed_at
            FROM ops_roundtable_sessions
            ORDER BY created_at DESC
            LIMIT 20
        `;

        return NextResponse.json({
            recentEvents,
            sessionStats,
            errorLog,
            eventTimeline,
            agentActivity,
            memoryStats,
            lastHeartbeat: lastHeartbeat[0] ?? null,
            recentSessions,
            serverTime: new Date().toISOString(),
        });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
