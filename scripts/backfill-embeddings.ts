// Backfill embeddings for existing memories
// One-time script: npx tsx scripts/backfill-embeddings.ts
//
// Requires: OLLAMA_BASE_URL and DATABASE_URL in .env.local

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? '';
const EMBEDDING_MODEL = 'bge-m3';
const BATCH_SIZE = 10;

if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
}

if (!OLLAMA_BASE_URL) {
    console.error('Missing OLLAMA_BASE_URL');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 3 });

async function getEmbedding(text: string): Promise<number[] | null> {
    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/v1/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
            signal: AbortSignal.timeout(30_000),
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

async function main() {
    // Count memories without embeddings
    const [{ total }] = await sql<[{ total: number }]>`
        SELECT COUNT(*)::int as total FROM ops_agent_memory
        WHERE embedding IS NULL
    `;

    console.log(`Found ${total} memories without embeddings`);

    let processed = 0;
    let failed = 0;

    while (true) {
        const batch = await sql`
            SELECT id, content FROM ops_agent_memory
            WHERE embedding IS NULL
            ORDER BY created_at ASC
            LIMIT ${BATCH_SIZE}
        `;

        if (batch.length === 0) break;

        for (const row of batch) {
            const embedding = await getEmbedding(row.content);

            if (embedding) {
                const vectorStr = `[${embedding.join(',')}]`;
                await sql`
                    UPDATE ops_agent_memory
                    SET embedding = ${vectorStr}::vector
                    WHERE id = ${row.id}
                `;
                processed++;
            } else {
                failed++;
            }
        }

        console.log(`Processed ${processed}/${total} (${failed} failed)`);

        // Brief pause to avoid hammering Ollama
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`Done: ${processed} embedded, ${failed} failed`);
    await sql.end();
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
