// /api/ops/events/stream — SSE endpoint for real-time agent events
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import {
    createSSEStream,
    sendEvent,
    keepAlive,
    createSSEResponse,
} from '@/lib/sse';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 2000;
const KEEPALIVE_INTERVAL_MS = 15000;

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const lastEventId = searchParams.get('last_event_id');
    const agentId = searchParams.get('agent_id');
    const kind = searchParams.get('kind');

    const { stream, writer } = createSSEStream();

    // Track cursor — use composite (created_at, id) to avoid skipping events with same timestamp
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;

    // If a last_event_id was provided, look up its created_at and id as the cursor
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

    // If no cursor yet, use current time
    if (!cursorCreatedAt) {
        cursorCreatedAt = new Date().toISOString();
        cursorId = null;
    }

    // Start keepalive
    const stopKeepAlive = keepAlive(writer, KEEPALIVE_INTERVAL_MS);

    // Poll for new events
    let isActive = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
        if (!isActive) return;

        try {
            // Query using composite cursor (created_at, id) to avoid skipping events
            const rows = await sql`
                SELECT * FROM ops_agent_events
                WHERE (
                    created_at > ${cursorCreatedAt}
                    ${cursorId ? sql`OR (created_at = ${cursorCreatedAt} AND id > ${cursorId})` : sql``}
                )
                ${agentId ? sql`AND agent_id = ${agentId}` : sql``}
                ${kind ? sql`AND kind = ${kind}` : sql``}
                ORDER BY created_at ASC, id ASC
                LIMIT 50
            `;

            // Send all events, then update cursor atomically
            for (const row of rows) {
                if (!isActive) break;
                await sendEvent(writer, 'event', row);
            }
            
            // Only update cursor if we successfully sent events
            if (rows.length > 0 && isActive) {
                const lastRow = rows[rows.length - 1];
                cursorCreatedAt = lastRow.created_at;
                cursorId = lastRow.id;
            }
        } catch (err) {
            // Stream may be closed by client
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

    return createSSEResponse(stream);
}
