// /api/ops/missions — List missions
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const createdBy = searchParams.get('created_by');
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);

    const sb = getServiceClient();
    let query = sb
        .from('ops_missions')
        .select('*, ops_mission_steps(*)')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (status) query = query.eq('status', status);
    if (createdBy) query = query.eq('created_by', createdBy);

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ missions: data });
}
