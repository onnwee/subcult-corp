// /api/ops/roundtable — Trigger and list roundtable conversations
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { enqueueConversation } from '@/lib/roundtable/orchestrator';
import type { ConversationFormat } from '@/lib/types';
import { logger } from '@/lib/logger';
import { withRequestContext } from '@/middleware';

const log = logger.child({ route: 'roundtable' });

export const dynamic = 'force-dynamic';

const VALID_FORMATS: ConversationFormat[] = [
    'standup',
    'checkin',
    'triage',
    'deep_dive',
    'risk_review',
    'strategy',
    'planning',
    'shipping',
    'retro',
    'debate',
    'cross_exam',
    'brainstorm',
    'reframe',
    'writing_room',
    'content_review',
    'watercooler',
];

// POST — manually trigger a conversation
export async function POST(req: NextRequest) {
    return withRequestContext(req, async () => {
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 },
            );
        }

        try {
            const body = await req.json();

            const format = (body.format ?? 'standup') as ConversationFormat;
            if (!VALID_FORMATS.includes(format)) {
                return NextResponse.json(
                    {
                        error: `Invalid format. Must be one of: ${VALID_FORMATS.join(', ')}`,
                    },
                    { status: 400 },
                );
            }

            if (
                !body.topic ||
                typeof body.topic !== 'string' ||
                body.topic.trim().length === 0
            ) {
                return NextResponse.json(
                    { error: 'Missing required field: topic' },
                    { status: 400 },
                );
            }

            if (
                !body.participants ||
                !Array.isArray(body.participants) ||
                body.participants.length < 2
            ) {
                return NextResponse.json(
                    {
                        error: 'participants must be an array of at least 2 agent IDs',
                    },
                    { status: 400 },
                );
            }

            const model =
                typeof body.model === 'string' ? body.model.trim() : undefined;

            const sessionId = await enqueueConversation({
                format,
                topic: body.topic.trim(),
                participants: body.participants,
                model: model || undefined,
            });

            return NextResponse.json(
                {
                    success: true,
                    sessionId,
                    message: `Conversation enqueued. The worker will pick it up and orchestrate it.`,
                },
                { status: 201 },
            );
        } catch (err) {
            log.error('POST error', { error: err });
            return NextResponse.json(
                { error: 'Internal server error' },
                { status: 500 },
            );
        }
    }); // withRequestContext
}

// GET — list conversation sessions (public for dashboard)
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const format = searchParams.get('format');
    const withTurns = searchParams.get('with_turns') === 'true';
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);

    try {
        let sessions;

        if (withTurns) {
            sessions = await sql`
                SELECT s.*,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'turn_number', t.turn_number,
                                'speaker', t.speaker,
                                'dialogue', t.dialogue,
                                'created_at', t.created_at
                            )
                            ORDER BY t.turn_number ASC
                        ) FILTER (WHERE t.id IS NOT NULL),
                        '[]'::json
                    ) AS ops_roundtable_turns
                FROM ops_roundtable_sessions s
                LEFT JOIN ops_roundtable_turns t ON t.session_id = s.id
                WHERE 1=1
                ${status ? sql`AND s.status = ${status}` : sql``}
                ${format ? sql`AND s.format = ${format}` : sql``}
                GROUP BY s.id
                ORDER BY s.created_at DESC
                LIMIT ${limit}
            `;
        } else {
            sessions = await sql`
                SELECT * FROM ops_roundtable_sessions
                WHERE 1=1
                ${status ? sql`AND status = ${status}` : sql``}
                ${format ? sql`AND format = ${format}` : sql``}
                ORDER BY created_at DESC
                LIMIT ${limit}
            `;
        }

        return NextResponse.json({ sessions });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
