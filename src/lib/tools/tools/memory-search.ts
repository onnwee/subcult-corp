// memory_search tool — semantic search over agent memories via pgvector
import type { NativeTool } from '../types';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'memory-search' });

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? '';
const EMBEDDING_MODEL = 'bge-m3';

/** Get embedding vector from Ollama */
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

export const memorySearchTool: NativeTool = {
    name: 'memory_search',
    description: 'Search agent memories using semantic similarity. Returns relevant memories from any agent.',
    agents: ['chora', 'subrosa', 'thaum', 'praxis', 'mux', 'primus'],
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'What to search for in agent memories',
            },
            agent_id: {
                type: 'string',
                description: 'Filter to a specific agent (optional)',
            },
            limit: {
                type: 'number',
                description: 'Maximum results (default 10)',
            },
        },
        required: ['query'],
    },
    execute: async (params) => {
        const query = params.query as string;
        const agentId = params.agent_id as string | undefined;
        const limit = Math.min((params.limit as number) || 10, 25);

        // Try vector search first
        const embedding = await getEmbedding(query);

        if (embedding) {
            try {
                const vectorStr = `[${embedding.join(',')}]`;
                const rows = await sql`
                    SELECT id, agent_id, type, content, confidence, tags, created_at,
                           1 - (embedding <=> ${vectorStr}::vector) as similarity
                    FROM ops_agent_memory
                    WHERE superseded_by IS NULL
                    ${agentId ? sql`AND agent_id = ${agentId}` : sql``}
                    AND embedding IS NOT NULL
                    ORDER BY embedding <=> ${vectorStr}::vector
                    LIMIT ${limit}
                `;

                return {
                    results: rows.map(r => ({
                        agent: r.agent_id,
                        type: r.type,
                        content: r.content,
                        confidence: r.confidence,
                        tags: r.tags,
                        similarity: Math.round(r.similarity * 100) / 100,
                        created_at: r.created_at,
                    })),
                    method: 'vector',
                    count: rows.length,
                };
            } catch (err) {
                log.warn('Vector search failed, falling back to text', { error: err });
            }
        }

        // Fallback: ILIKE text search
        const rows = await sql`
            SELECT id, agent_id, type, content, confidence, tags, created_at
            FROM ops_agent_memory
            WHERE superseded_by IS NULL
            ${agentId ? sql`AND agent_id = ${agentId}` : sql``}
            AND content ILIKE ${'%' + query + '%'}
            ORDER BY created_at DESC
            LIMIT ${limit}
        `;

        return {
            results: rows.map(r => ({
                agent: r.agent_id,
                type: r.type,
                content: r.content,
                confidence: r.confidence,
                tags: r.tags,
                created_at: r.created_at,
            })),
            method: 'text',
            count: rows.length,
        };
    },
};
