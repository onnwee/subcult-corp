// /api/ops/roundtable — Trigger and list roundtable conversations
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { enqueueConversation } from '@/lib/roundtable/orchestrator';
import type { ConversationFormat } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_FORMATS: ConversationFormat[] = [
    'standup',
    'debate',
    'watercooler',
];

// POST — manually trigger a conversation
export async function POST(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

        const sb = getServiceClient();
        const sessionId = await enqueueConversation(sb, {
            format,
            topic: body.topic.trim(),
            participants: body.participants,
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
        console.error('[roundtable] POST error:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}

// GET — list conversation sessions with optional filters
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const format = searchParams.get('format');
    const withTurns = searchParams.get('with_turns') === 'true';
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);

    const sb = getServiceClient();

    // Build session query
    const selectFields =
        withTurns ?
            '*, ops_roundtable_turns(turn_number, speaker, dialogue, created_at)'
        :   '*';

    let query = sb
        .from('ops_roundtable_sessions')
        .select(selectFields)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (status) query = query.eq('status', status);
    if (format) query = query.eq('format', format);

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessions: data });
}
