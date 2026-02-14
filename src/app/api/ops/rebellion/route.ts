// /api/ops/rebellion — Query rebellion state for all agents or a specific agent
import { NextRequest, NextResponse } from 'next/server';
import { getRebellingAgents } from '@/lib/ops/rebellion';
import { withRequestContext } from '@/middleware';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    return withRequestContext(req, async () => {
        const rebels = await getRebellingAgents();
        return NextResponse.json({
            rebels,
            count: rebels.length,
        });
    });
}
