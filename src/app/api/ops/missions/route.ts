// /api/ops/missions — List missions with nested steps
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const createdBy = searchParams.get('created_by');
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);

    try {
        const rows = await sql`
            SELECT m.*,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', s.id,
                            'mission_id', s.mission_id,
                            'kind', s.kind,
                            'status', s.status,
                            'payload', s.payload,
                            'result', s.result,
                            'reserved_by', s.reserved_by,
                            'failure_reason', s.failure_reason,
                            'started_at', s.started_at,
                            'completed_at', s.completed_at,
                            'created_at', s.created_at,
                            'updated_at', s.updated_at
                        )
                    ) FILTER (WHERE s.id IS NOT NULL),
                    '[]'::json
                ) AS ops_mission_steps
            FROM ops_missions m
            LEFT JOIN ops_mission_steps s ON s.mission_id = m.id
            WHERE 1=1
            ${status ? sql`AND m.status = ${status}` : sql``}
            ${createdBy ? sql`AND m.created_by = ${createdBy}` : sql``}
            GROUP BY m.id
            ORDER BY m.created_at DESC
            LIMIT ${limit}
        `;

        return NextResponse.json({ missions: rows });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
