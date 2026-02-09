// Event emitter — write to ops_agent_events
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventInput } from '../types';

export async function emitEvent(
    sb: SupabaseClient,
    input: EventInput,
): Promise<string> {
    const { data, error } = await sb
        .from('ops_agent_events')
        .insert({
            agent_id: input.agent_id,
            kind: input.kind,
            title: input.title,
            summary: input.summary ?? null,
            tags: input.tags ?? [],
            metadata: input.metadata ?? {},
        })
        .select('id')
        .single();

    if (error) {
        console.error('[event] Failed to emit event:', error.message);
        throw new Error(`Failed to emit event: ${error.message}`);
    }

    return data.id;
}

// Check reaction matrix after emitting an event
export async function emitEventAndCheckReactions(
    sb: SupabaseClient,
    input: EventInput,
): Promise<string> {
    const eventId = await emitEvent(sb, input);

    // Lazy import to avoid circular deps
    const { checkReactionMatrix } = await import('./reaction-matrix');
    await checkReactionMatrix(sb, eventId, input);

    return eventId;
}
