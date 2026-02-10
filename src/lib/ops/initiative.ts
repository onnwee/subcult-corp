// Initiative queueing and processing
import { sql } from '@/lib/db';
import { AGENT_IDS } from '../agents';
import { getPolicy } from './policy';
import { queryAgentMemories } from './memory';

const INITIATIVE_COOLDOWN_MINUTES = 120;
const MIN_MEMORIES_FOR_INITIATIVE = 5;

export async function maybeQueueInitiative(
    agentId: string,
): Promise<string | null> {
    // Cooldown check
    const cutoff = new Date(
        Date.now() - INITIATIVE_COOLDOWN_MINUTES * 60_000,
    ).toISOString();

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_initiative_queue
        WHERE agent_id = ${agentId}
        AND created_at >= ${cutoff}
    `;

    if (count > 0) return null;

    // Memory prerequisites
    const memories = await queryAgentMemories({
        agentId,
        limit: MIN_MEMORIES_FOR_INITIATIVE,
        minConfidence: 0.55,
    });

    if (memories.length < MIN_MEMORIES_FOR_INITIATIVE) return null;

    // Queue initiative with memory context
    const context = {
        memories: memories.map(m => ({
            type: m.type,
            content: m.content,
            confidence: m.confidence,
            tags: m.tags,
        })),
    };

    const [row] = await sql`
        INSERT INTO ops_initiative_queue (agent_id, status, context)
        VALUES (${agentId}, 'pending', ${JSON.stringify(context)}::jsonb)
        RETURNING id
    `;

    return row.id;
}

export async function checkAndQueueInitiatives(): Promise<{
    checked: number;
    queued: number;
}> {
    const policy = await getPolicy('initiative_policy');
    if (!(policy.enabled as boolean)) {
        return { checked: 0, queued: 0 };
    }

    let queued = 0;
    for (const agentId of AGENT_IDS) {
        try {
            const id = await maybeQueueInitiative(agentId);
            if (id) queued++;
        } catch (err) {
            console.error(
                `[initiative] Failed to queue for ${agentId}:`,
                (err as Error).message,
            );
        }
    }

    return { checked: AGENT_IDS.length, queued };
}

export async function claimNextInitiative(): Promise<{
    id: string;
    agent_id: string;
    context: Record<string, unknown>;
} | null> {
    const [claimed] = await sql`
        UPDATE ops_initiative_queue
        SET status = 'processing'
        WHERE id = (
            SELECT id FROM ops_initiative_queue
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, agent_id, context
    `;

    if (!claimed) return null;
    return claimed as {
        id: string;
        agent_id: string;
        context: Record<string, unknown>;
    };
}

export async function completeInitiative(
    id: string,
    result: Record<string, unknown>,
): Promise<void> {
    await sql`
        UPDATE ops_initiative_queue
        SET status = 'completed',
            processed_at = NOW(),
            result = ${JSON.stringify(result)}::jsonb
        WHERE id = ${id}
    `;
}

export async function failInitiative(id: string, error: string): Promise<void> {
    await sql`
        UPDATE ops_initiative_queue
        SET status = 'failed',
            processed_at = NOW(),
            result = ${JSON.stringify({ error })}::jsonb
        WHERE id = ${id}
    `;
}
