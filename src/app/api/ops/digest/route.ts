// /api/ops/digest — Daily digest retrieval endpoint
// GET ?date=YYYY-MM-DD returns single digest
// GET ?limit=N returns last N digests (default 7, max 30)

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface DigestRow {
    id: string;
    digest_date: string;
    summary: string;
    highlights: string;
    stats: string;
    generated_by: string;
    created_at: string;
}

function parseRow(row: DigestRow) {
    return {
        id: row.id,
        digest_date: row.digest_date,
        summary: row.summary,
        highlights:
            typeof row.highlights === 'string' ?
                JSON.parse(row.highlights)
            :   row.highlights,
        stats:
            typeof row.stats === 'string' ? JSON.parse(row.stats) : row.stats,
        generated_by: row.generated_by,
        created_at: row.created_at,
    };
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const limitParam = searchParams.get('limit');

        // Single date query
        if (date) {
            // Validate date format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return NextResponse.json(
                    { error: 'Invalid date format. Use YYYY-MM-DD' },
                    { status: 400 },
                );
            }

            const rows = await sql<DigestRow[]>`
                SELECT id, digest_date::text, summary, highlights, stats, generated_by, created_at
                FROM ops_daily_digests
                WHERE digest_date = ${date}
            `;

            if (rows.length === 0) {
                return NextResponse.json(
                    { error: 'No digest found for this date' },
                    { status: 404 },
                );
            }

            return NextResponse.json({ digest: parseRow(rows[0]) });
        }

        // List query
        const limit = Math.min(
            Math.max(parseInt(limitParam ?? '7', 10) || 7, 1),
            30,
        );

        const rows = await sql<DigestRow[]>`
            SELECT id, digest_date::text, summary, highlights, stats, generated_by, created_at
            FROM ops_daily_digests
            ORDER BY digest_date DESC
            LIMIT ${limit}
        `;

        return NextResponse.json({
            digests: rows.map(parseRow),
        });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
