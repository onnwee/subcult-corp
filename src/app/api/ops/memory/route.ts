// GET /api/ops/memory — query agent memories with filters
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import type { MemoryEntry, MemoryType } from '@/lib/types';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'api:memory' });

const VALID_TYPES = new Set<MemoryType>([
    'insight',
    'pattern',
    'strategy',
    'preference',
    'lesson',
]);

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const agentId = searchParams.get('agent_id');
        const typeParam = searchParams.get('type');
        const minConfidence = searchParams.get('min_confidence');
        const tagsParam = searchParams.get('tags');
        const search = searchParams.get('search');
        const limit = Math.min(
            Number(searchParams.get('limit') ?? 100),
            500,
        );
        const offset = Number(searchParams.get('offset') ?? 0);

        // Build dynamic conditions
        const conditions: ReturnType<typeof sql>[] = [];

        if (agentId) {
            conditions.push(sql`agent_id = ${agentId}`);
        }

        if (typeParam) {
            const types = typeParam.split(',').filter(t => VALID_TYPES.has(t as MemoryType));
            if (types.length > 0) {
                conditions.push(sql`type = ANY(${types})`);
            }
        }

        if (minConfidence) {
            const mc = Number(minConfidence);
            if (!isNaN(mc) && mc >= 0 && mc <= 1) {
                conditions.push(sql`confidence >= ${mc}`);
            }
        }

        if (tagsParam) {
            const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
            if (tags.length > 0) {
                conditions.push(sql`tags && ${tags}`);
            }
        }

        if (search) {
            conditions.push(sql`content ILIKE ${'%' + search + '%'}`);
        }

        // Only show active (non-superseded) memories by default
        conditions.push(sql`superseded_by IS NULL`);

        const whereClause =
            conditions.length > 0
                ? sql`WHERE ${conditions.reduce((a, b) => sql`${a} AND ${b}`)}`
                : sql``;

        const memories = await sql<MemoryEntry[]>`
            SELECT * FROM ops_agent_memory
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ${limit}
            OFFSET ${offset}
        `;

        // Also get total count for pagination
        const [{ count }] = await sql<[{ count: number }]>`
            SELECT COUNT(*)::int as count FROM ops_agent_memory
            ${whereClause}
        `;

        return NextResponse.json({ memories, total: count });
    } catch (err) {
        log.error('Failed to query memories', { error: err });
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}
