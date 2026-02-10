// Event emitter — write to ops_agent_events
import { sql } from '@/lib/db';
import type { EventInput } from '../types';

export async function emitEvent(input: EventInput): Promise<string> {
    try {
        const meta = input.metadata ?? {};
        const [row] = await sql`
            INSERT INTO ops_agent_events (agent_id, kind, title, summary, tags, metadata)
            VALUES (
                ${input.agent_id},
                ${input.kind},
                ${input.title},
                ${input.summary ?? null},
                ${input.tags ?? []},
                ${JSON.stringify(meta)}::jsonb
            )
            RETURNING id`;

        return row.id;
    } catch (err) {
        console.error('[event] Failed to emit event:', (err as Error).message);
        throw new Error(`Failed to emit event: ${(err as Error).message}`);
    }
}

// Check reaction matrix after emitting an event
export async function emitEventAndCheckReactions(
    input: EventInput,
): Promise<string> {
    const eventId = await emitEvent(input);

    // Lazy import to avoid circular deps
    const { checkReactionMatrix } = await import('./reaction-matrix');
    await checkReactionMatrix(eventId, input);

    return eventId;
}
