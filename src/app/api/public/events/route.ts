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
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Expose-Headers': 'Retry-After',
    };

    // Rate-limit by client IP
    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
        return NextResponse.json(
            { error: 'Rate limit exceeded. Max 30 requests per minute.' },
            {
                status: 429,
                headers: {
                    ...corsHeaders,
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
            // Use CTE to fetch cursor row once and avoid repeated subqueries
            rows = await sql`
                WITH cursor_row AS (
                    SELECT created_at, id
                    FROM ops_agent_events
                    WHERE id = ${afterId}
                )
                SELECT e.id, e.agent_id, e.kind, e.title, e.summary, e.tags, e.created_at
                FROM ops_agent_events e, cursor_row c
                WHERE e.kind = ANY(${PUBLIC_SAFE_KINDS as unknown as string[]})
                AND (
                    e.created_at > c.created_at
                    OR (
                        e.created_at = c.created_at
                        AND e.id > c.id
                    )
                )
                ORDER BY e.created_at ASC, e.id ASC
                LIMIT ${limit}
            `;
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

        return NextResponse.json(
            {
                events: rows.map(r => sanitizeEvent(r as Record<string, unknown>)),
            },
            { headers: corsHeaders },
        );
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500, headers: corsHeaders },
        );
    }
}
