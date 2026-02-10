// /api/ops/stats — System statistics for the stage dashboard
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [events, missions, sessions, memories] = await Promise.all([
            sql<
                [{ count: number }]
            >`SELECT COUNT(*)::int as count FROM ops_agent_events`,
            sql<
                [{ count: number }]
            >`SELECT COUNT(*)::int as count FROM ops_missions WHERE status IN ('approved', 'running')`,
            sql<
                [{ count: number }]
            >`SELECT COUNT(*)::int as count FROM ops_roundtable_sessions`,
            sql<{ agent_id: string; count: number }[]>`
                SELECT agent_id, COUNT(*)::int as count
                FROM ops_agent_memory
                WHERE superseded_by IS NULL
                GROUP BY agent_id
            `,
        ]);

        return NextResponse.json({
            totalEvents: events[0].count,
            activeMissions: missions[0].count,
            totalSessions: sessions[0].count,
            memoriesByAgent: Object.fromEntries(
                memories.map(r => [r.agent_id, r.count]),
            ),
        });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
