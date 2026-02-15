// /api/public/events — Public-facing events API (filtered, sanitized)
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    PUBLIC_SAFE_KINDS,
    sanitizeEvent,
    checkRateLimit,
    getClientIp,
} from '@/lib/public-events';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // Rate-limit by client IP
    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
        return NextResponse.json(
            { error: 'Rate limit exceeded. Max 30 requests per minute.' },
            {
                status: 429,
                headers: {
                    'Retry-After': '60',
                },
            },
        );
    }

    const { searchParams } = new URL(req.url);
    const rawLimit = parseInt(searchParams.get('limit') ?? '50', 10);
    const limit = Math.min(Math.max(rawLimit, 1), 100);
    const afterId = searchParams.get('after_id');

    try {
        // If after_id is provided, fetch events newer than that event
        let rows: Array<Record<string, unknown>> = [];
        if (afterId) {
            // Get the timestamp of the after_id event first
            const [afterEvent] = await sql<
                [{ created_at: string }?]
            >`
                SELECT created_at FROM ops_agent_events WHERE id = ${afterId} LIMIT 1
            `;

            if (afterEvent) {
                // When paginating forward, return in ASC order (oldest first)
                rows = await sql`
                    SELECT id, agent_id, kind, title, summary, tags, created_at
                    FROM ops_agent_events
                    WHERE kind = ANY(${PUBLIC_SAFE_KINDS as unknown as string[]})
                    AND (
                        created_at > ${afterEvent.created_at}
                        OR (created_at = ${afterEvent.created_at} AND id > ${afterId})
                    )
                    ORDER BY created_at ASC, id ASC
                    LIMIT ${limit}
                `;
            }
        } else {
            // Initial load: return in DESC order (newest first)
            rows = await sql`
                SELECT id, agent_id, kind, title, summary, tags, created_at
                FROM ops_agent_events
                WHERE kind = ANY(${PUBLIC_SAFE_KINDS as unknown as string[]})
                ORDER BY created_at DESC
                LIMIT ${limit}
            `;
        }

        return NextResponse.json({
            events: rows.map(r => sanitizeEvent(r as Record<string, unknown>)),
        }, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
