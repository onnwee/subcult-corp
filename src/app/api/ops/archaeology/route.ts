// /api/ops/archaeology — Memory Archaeology API endpoint
// Query dig history, retrieve findings, and trigger manual digs.
import { NextRequest, NextResponse } from 'next/server';
import {
    getDigHistory,
    getFindings,
    getFindingsForMemory,
    getLatestFindings,
    performDig,
} from '@/lib/ops/memory-archaeology';
import { withRequestContext } from '@/middleware';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'api-archaeology' });

export const dynamic = 'force-dynamic';

const VALID_FINDING_TYPES = new Set([
    'pattern',
    'contradiction',
    'emergence',
    'echo',
    'drift',
]);

export async function GET(req: NextRequest) {
    return withRequestContext(req, async () => {
        const { searchParams } = req.nextUrl;
        const digId = searchParams.get('dig_id') ?? undefined;
        const memoryId = searchParams.get('memory_id') ?? undefined;
        const limitParam = searchParams.get('limit');
        const limit =
            limitParam ?
                Math.min(Math.max(parseInt(limitParam, 10), 1), 100)
            :   20;

        // Findings for a specific dig
        if (digId) {
            const findings = await getFindings(digId);
            return NextResponse.json({ findings });
        }

        // Findings referencing a specific memory
        if (memoryId) {
            const findings = await getFindingsForMemory(memoryId);
            return NextResponse.json({ findings });
        }

        // Latest findings (for dashboard widgets)
        if (searchParams.get('latest') === 'true') {
            const findings = await getLatestFindings(limit);
            return NextResponse.json({ findings });
        }

        // Default: dig history
        const digs = await getDigHistory(limit);
        return NextResponse.json({ digs });
    });
}

export async function POST(req: NextRequest) {
    return withRequestContext(req, async () => {
        try {
            const body = await req.json().catch(() => ({}));
            const { agent_id, time_range, max_memories, finding_types } =
                body as {
                    agent_id?: string;
                    time_range?: { from: string; to: string };
                    max_memories?: number;
                    finding_types?: string[];
                };

            // Validate finding_types if provided
            if (finding_types?.length) {
                const invalid = finding_types.filter(
                    t => !VALID_FINDING_TYPES.has(t),
                );
                if (invalid.length > 0) {
                    return NextResponse.json(
                        {
                            error: `Invalid finding types: ${invalid.join(', ')}`,
                        },
                        { status: 400 },
                    );
                }
            }

            log.info('Manual archaeology dig triggered', {
                agent_id,
                max_memories,
            });

            const result = await performDig({
                agent_id,
                time_range:
                    time_range ?
                        {
                            from: new Date(time_range.from),
                            to: new Date(time_range.to),
                        }
                    :   undefined,
                max_memories: max_memories ?? 100,
                finding_types: finding_types as
                    | (typeof result.findings)[0]['finding_type'][]
                    | undefined,
            });

            return NextResponse.json(result);
        } catch (err) {
            log.error('Archaeology dig failed', { error: err });
            return NextResponse.json(
                { error: `Archaeology dig failed: ${(err as Error).message}` },
                { status: 500 },
            );
        }
    });
}
