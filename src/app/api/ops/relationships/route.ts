// GET /api/ops/relationships — fetch all agent relationships
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import type { AgentRelationship } from '@/lib/types';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'api:relationships' });

export async function GET() {
    try {
        const relationships = await sql<AgentRelationship[]>`
            SELECT * FROM ops_agent_relationships
            ORDER BY affinity DESC
        `;

        return NextResponse.json({ relationships });
    } catch (err) {
        log.error('Failed to query relationships', { error: err });
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}
