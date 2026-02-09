// /api/ops/events — List recent events
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agent_id');
    const kind = searchParams.get('kind');
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);

    const sb = getServiceClient();
    let query = sb
        .from('ops_agent_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (agentId) query = query.eq('agent_id', agentId);
    if (kind) query = query.eq('kind', kind);

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ events: data });
}
