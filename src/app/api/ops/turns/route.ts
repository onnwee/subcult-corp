// /api/ops/turns — List roundtable turns by session ID
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
        return NextResponse.json(
            { error: 'session_id is required' },
            { status: 400 },
        );
    }

    try {
        const rows = await sql`
            SELECT * FROM ops_roundtable_turns
            WHERE session_id = ${sessionId}
            ORDER BY turn_number ASC
        `;

        return NextResponse.json({ turns: rows });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
