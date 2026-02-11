// /api/ops/events — List recent events
import { NextRequest, NextResponse } from 'next/server';
import { sql, jsonb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agent_id');
    const kind = searchParams.get('kind');
    const missionId = searchParams.get('mission_id');
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);

    try {
        const rows = await sql`
            SELECT * FROM ops_agent_events
            WHERE 1=1
            ${agentId ? sql`AND agent_id = ${agentId}` : sql``}
            ${kind ? sql`AND kind = ${kind}` : sql``}
            ${missionId ? sql`AND metadata @> ${jsonb({ missionId })}` : sql``}
            ORDER BY created_at DESC
            LIMIT ${limit}
        `;

        return NextResponse.json({ events: rows });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
