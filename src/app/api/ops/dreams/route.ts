// /api/ops/dreams — Query dream cycles and their source memories
import { NextRequest, NextResponse } from 'next/server';
import {
    getDreamCycles,
    getDreamWithSources,
    type DreamType,
} from '@/lib/ops/dreams';
import { withRequestContext } from '@/middleware';

export const dynamic = 'force-dynamic';

const VALID_DREAM_TYPES = new Set([
    'recombination',
    'extrapolation',
    'contradiction',
    'synthesis',
]);

export async function GET(req: NextRequest) {
    return withRequestContext(req, async () => {
        const { searchParams } = req.nextUrl;
        const agentId = searchParams.get('agent_id') ?? undefined;
        const dreamType = searchParams.get('dream_type') ?? undefined;
        const dreamId = searchParams.get('id') ?? undefined;
        const limitParam = searchParams.get('limit');
        const limit =
            limitParam ?
                Math.min(Math.max(parseInt(limitParam, 10), 1), 100)
            :   20;

        // Validate dream_type if provided
        if (dreamType && !VALID_DREAM_TYPES.has(dreamType)) {
            return NextResponse.json(
                {
                    error: `Invalid dream_type. Must be one of: ${[...VALID_DREAM_TYPES].join(', ')}`,
                },
                { status: 400 },
            );
        }

        // Single dream with source memories
        if (dreamId) {
            const result = await getDreamWithSources(dreamId);
            if (!result) {
                return NextResponse.json(
                    { error: 'Dream not found' },
                    { status: 404 },
                );
            }
            return NextResponse.json(result);
        }

        // List dreams with optional filters
        const dreams = await getDreamCycles({
            agentId,
            dreamType: dreamType as DreamType | undefined,
            limit,
        });

        return NextResponse.json({ dreams, count: dreams.length });
    });
}
