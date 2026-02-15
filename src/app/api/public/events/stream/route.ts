// /api/public/events/stream — Public SSE stream for real-time agent events
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
    createSSEStream,
    sendEvent,
    keepAlive,
    createSSEResponse,
} from '@/lib/sse';
import {
    PUBLIC_SAFE_KINDS,
    sanitizeEvent,
    checkRateLimit,
    getClientIp,
} from '@/lib/public-events';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 3000; // Slightly slower than internal (2s)
const KEEPALIVE_INTERVAL_MS = 20000;

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
    const lastEventId = searchParams.get('last_event_id');

    const { stream, writer } = createSSEStream();

    // Track cursor — composite (created_at, id) to avoid skipping same-timestamp events
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;

    // If a last_event_id was provided, look up its cursor position
    if (lastEventId) {
        try {
            const rows = await sql`
                SELECT created_at, id FROM ops_agent_events
                WHERE id = ${lastEventId}
                LIMIT 1
            `;
            if (rows.length > 0) {
                cursorCreatedAt = rows[0].created_at;
                cursorId = rows[0].id;
            }
        } catch {
            // If lookup fails, start from now
        }
    }

    // Default cursor: current time
    if (!cursorCreatedAt) {
        cursorCreatedAt = new Date().toISOString();
        cursorId = null;
    }

    // Start keepalive
    const stopKeepAlive = keepAlive(writer, KEEPALIVE_INTERVAL_MS);

    // Poll loop
    let isActive = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
        if (!isActive) return;

        try {
            const rows = await sql`
                SELECT id, agent_id, kind, title, summary, tags, created_at
                FROM ops_agent_events
                WHERE (
                    created_at > ${cursorCreatedAt}
                    ${cursorId ? sql`OR (created_at = ${cursorCreatedAt} AND id > ${cursorId})` : sql``}
                )
                AND kind = ANY(${PUBLIC_SAFE_KINDS as unknown as string[]})
                ORDER BY created_at ASC, id ASC
                LIMIT 50
            `;

            // Send all events, then update cursor atomically
            for (const row of rows) {
                if (!isActive) break;
                const sanitized = sanitizeEvent(row as Record<string, unknown>);
                await sendEvent(writer, 'event', sanitized);
            }
            
            // Only update cursor if we successfully sent events
            if (rows.length > 0 && isActive) {
                const lastRow = rows[rows.length - 1];
                cursorCreatedAt = lastRow.created_at;
                cursorId = lastRow.id;
            }
        } catch (err) {
            if (isActive) {
                try {
                    await sendEvent(writer, 'error', {
                        message: (err as Error).message,
                    });
                } catch {
                    // Writer closed, stop polling
                    isActive = false;
                }
            }
        }

        if (isActive) {
            pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        }
    }

    // Start first poll
    poll();

    // Handle client disconnect
    req.signal.addEventListener('abort', () => {
        isActive = false;
        stopKeepAlive();
        if (pollTimer) clearTimeout(pollTimer);
        writer.close().catch(() => {});
    });

    return createSSEResponse(stream, true);
}
