// Agent memory — query, write, manage memory entries
import { sql } from '@/lib/db';
import type {
    MemoryEntry,
    MemoryInput,
    MemoryQuery,
    MemoryCache,
} from '../types';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'memory' });

const MAX_MEMORIES_PER_AGENT = 200;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? '';
const EMBEDDING_MODEL = 'bge-m3';

/** Get embedding vector from Ollama (fire-and-forget safe) */
async function getEmbedding(text: string): Promise<number[] | null> {
    if (!OLLAMA_BASE_URL) return null;
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/v1/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return null;
        const data = await response.json() as {
            data?: Array<{ embedding: number[] }>;
        };
        return data.data?.[0]?.embedding ?? null;
    } catch {
        return null;
    }
}

export async function queryAgentMemories(
    query: MemoryQuery,
): Promise<MemoryEntry[]> {
    const { agentId, types, tags, minConfidence, limit = 50 } = query;

    const rows = await sql<MemoryEntry[]>`
        SELECT * FROM ops_agent_memory
        WHERE agent_id = ${agentId}
        AND superseded_by IS NULL
        ${types?.length ? sql`AND type = ANY(${types})` : sql``}
        ${tags?.length ? sql`AND tags && ${tags}` : sql``}
        ${minConfidence ? sql`AND confidence >= ${minConfidence}` : sql``}
        ORDER BY created_at DESC
        LIMIT ${limit}
    `;

    return rows;
}

export async function writeMemory(input: MemoryInput): Promise<string | null> {
    const confidence = input.confidence ?? 0.5;

    // Confidence gate
    if (confidence < 0.4) return null;

    // Dedup via source_trace_id
    if (input.source_trace_id) {
        const [{ count }] = await sql<[{ count: number }]>`
            SELECT COUNT(*)::int as count FROM ops_agent_memory
            WHERE source_trace_id = ${input.source_trace_id}
        `;
        if (count > 0) return null;
    }

    try {
        // Compute embedding (best-effort — null if Ollama unavailable)
        const embedding = await getEmbedding(input.content);

        const insertData: Record<string, unknown> = {
            agent_id: input.agent_id,
            type: input.type,
            content: input.content,
            confidence: Math.round(confidence * 100) / 100,
            tags: input.tags ?? [],
            source_trace_id: input.source_trace_id ?? null,
        };

        let row;
        if (embedding) {
            const vectorStr = `[${embedding.join(',')}]`;
            [row] = await sql`
                INSERT INTO ops_agent_memory ${sql(insertData)}
                RETURNING id
            `;
            // Update embedding separately (avoids postgres.js type issues with vector)
            await sql`
                UPDATE ops_agent_memory
                SET embedding = ${vectorStr}::vector
                WHERE id = ${row.id}
            `.catch(() => { /* ignore if vector column not yet available */ });
        } else {
            [row] = await sql`
                INSERT INTO ops_agent_memory ${sql(insertData)}
                RETURNING id
            `;
        }

        return row.id;
    } catch (err) {
        log.error('Failed to write memory', {
            error: err,
            agent_id: input.agent_id,
            type: input.type,
        });
        return null;
    }
}

export async function enforceMemoryCap(agentId: string): Promise<void> {
    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_agent_memory
        WHERE agent_id = ${agentId} AND superseded_by IS NULL
    `;

    if (count <= MAX_MEMORIES_PER_AGENT) return;

    const overage = count - MAX_MEMORIES_PER_AGENT;
    const oldest = await sql<{ id: string }[]>`
        SELECT id FROM ops_agent_memory
        WHERE agent_id = ${agentId} AND superseded_by IS NULL
        ORDER BY created_at ASC
        LIMIT ${overage}
    `;

    if (oldest.length > 0) {
        const ids = oldest.map(r => r.id);
        await sql`DELETE FROM ops_agent_memory WHERE id = ANY(${ids})`;
    }
}

export async function getCachedMemories(
    agentId: string,
    cache: MemoryCache,
): Promise<MemoryEntry[]> {
    if (cache.has(agentId)) return cache.get(agentId)!;
    const memories = await queryAgentMemories({ agentId, limit: 50 });
    cache.set(agentId, memories);
    return memories;
}

export async function countTodayMemories(agentId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_agent_memory
        WHERE agent_id = ${agentId}
        AND created_at >= ${todayStart.toISOString()}
    `;

    return count;
}
