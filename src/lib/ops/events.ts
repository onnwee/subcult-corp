// Event emitter — write to ops_agent_events
import { sql, jsonb } from '@/lib/db';
import type { EventInput } from '../types';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'events' });

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
                ${jsonb(meta)}
            )
            RETURNING id`;

        return row.id;
    } catch (err) {
        log.error('Failed to emit event', {
            error: err,
            kind: input.kind,
            agent_id: input.agent_id,
        });
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
