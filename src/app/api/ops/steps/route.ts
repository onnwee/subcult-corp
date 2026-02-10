// /api/ops/steps — List mission steps by mission ID
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const missionId = searchParams.get('mission_id');

    if (!missionId) {
        return NextResponse.json(
            { error: 'mission_id is required' },
            { status: 400 },
        );
    }

    try {
        const rows = await sql`
            SELECT * FROM ops_mission_steps
            WHERE mission_id = ${missionId}
            ORDER BY created_at ASC
        `;

        return NextResponse.json({ steps: rows });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
