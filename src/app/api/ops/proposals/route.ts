// /api/ops/proposals — Create and list proposals
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { createProposalAndMaybeAutoApprove } from '@/lib/ops/proposal-service';

export const dynamic = 'force-dynamic';

// POST — submit a new proposal
export async function POST(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();

        if (!body.agent_id || !body.title || !body.proposed_steps?.length) {
            return NextResponse.json(
                {
                    error: 'Missing required fields: agent_id, title, proposed_steps',
                },
                { status: 400 },
            );
        }

        const result = await createProposalAndMaybeAutoApprove({
            agent_id: body.agent_id,
            title: body.title,
            description: body.description,
            proposed_steps: body.proposed_steps,
            source: body.source ?? 'agent',
            source_trace_id: body.source_trace_id,
        });

        return NextResponse.json(result, {
            status: result.success ? 201 : 422,
        });
    } catch (err) {
        console.error('[proposals] POST error:', err);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}

// GET — list proposals with optional filters
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const agentId = searchParams.get('agent_id');
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);

    try {
        const rows = await sql`
            SELECT * FROM ops_mission_proposals
            WHERE 1=1
            ${status ? sql`AND status = ${status}` : sql``}
            ${agentId ? sql`AND agent_id = ${agentId}` : sql``}
            ORDER BY created_at DESC
            LIMIT ${limit}
        `;

        return NextResponse.json({ proposals: rows });
    } catch (err) {
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
