// /api/ops/roundtable/stream — SSE endpoint for live roundtable turns
import { NextRequest, NextResponse } from 'next/server';
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
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
        return NextResponse.json(
            { error: 'session_id is required' },
            { status: 400 },
        );
    }

    const { stream, writer } = createSSEStream();

    let lastTurnNumber = 0;

    // Start keepalive
    const stopKeepAlive = keepAlive(writer, KEEPALIVE_INTERVAL_MS);

    let isActive = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
        if (!isActive) return;

        try {
            // Fetch new turns
            const turns = await sql`
                SELECT * FROM ops_roundtable_turns
                WHERE session_id = ${sessionId}
                AND turn_number > ${lastTurnNumber}
                ORDER BY turn_number ASC
                LIMIT 50
            `;

            // Send all turns, then update cursor atomically
            for (const turn of turns) {
                if (!isActive) break;
                await sendEvent(writer, 'turn', turn);
            }
            
            // Only update cursor if we successfully sent turns
            if (turns.length > 0 && isActive) {
                const lastTurn = turns[turns.length - 1];
                lastTurnNumber = lastTurn.turn_number;
            }

            // Check session status only if still active
            if (isActive) {
                const sessionRows = await sql`
                    SELECT status FROM ops_roundtable_sessions
                    WHERE id = ${sessionId}
                    LIMIT 1
                `;

                if (sessionRows.length > 0) {
                    const status = sessionRows[0].status;
                    if (status === 'completed' || status === 'failed') {
                        await sendEvent(writer, 'session_complete', { status });
                        isActive = false;
                        stopKeepAlive();
                        await writer.close().catch(() => {});
                        return;
                    }
                }
            }
        } catch (err) {
            if (isActive) {
                try {
                    await sendEvent(writer, 'error', {
                        message: (err as Error).message,
                    });
                } catch {
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
