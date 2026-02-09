// Agent Memory — structured knowledge store
// CRUD operations for ops_agent_memory with dedup, capping, and caching
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    MemoryEntry,
    MemoryInput,
    MemoryQuery,
    MemoryCache,
} from '../types';

const MIN_CONFIDENCE = 0.55;
const DEFAULT_MEMORY_CAP = 200;

/**
 * Query agent memories with filters.
 */
export async function queryAgentMemories(
    sb: SupabaseClient,
    query: MemoryQuery,
): Promise<MemoryEntry[]> {
    const limit = query.limit ?? 20;
    const minConfidence = query.minConfidence ?? MIN_CONFIDENCE;

    let q = sb
        .from('ops_agent_memory')
        .select('*')
        .eq('agent_id', query.agentId)
        .is('superseded_by', null)
        .gte('confidence', minConfidence)
        .order('confidence', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

    if (query.types?.length) {
        q = q.in('type', query.types);
    }

    if (query.tags?.length) {
        q = q.overlaps('tags', query.tags);
    }

    const { data, error } = await q;

    if (error) {
        console.error('[memory] Query failed:', error.message);
        return [];
    }

    return (data as MemoryEntry[]) ?? [];
}

/**
 * Write a memory with idempotent dedup and confidence gating.
 * Returns the memory ID if written, null if skipped (dedup or low confidence).
 */
export async function writeMemory(
    sb: SupabaseClient,
    input: MemoryInput,
): Promise<string | null> {
    const confidence = input.confidence ?? 0.6;

    // Drop low-confidence memories
    if (confidence < MIN_CONFIDENCE) {
        console.log(
            `[memory] Dropped low-confidence memory (${confidence}): "${input.content.substring(0, 50)}..."`,
        );
        return null;
    }

    // Idempotent dedup via source_trace_id
    if (input.source_trace_id) {
        const { count } = await sb
            .from('ops_agent_memory')
            .select('id', { count: 'exact', head: true })
            .eq('source_trace_id', input.source_trace_id);

        if ((count ?? 0) > 0) {
            return null; // Already exists
        }
    }

    // Insert the memory
    const { data, error } = await sb
        .from('ops_agent_memory')
        .insert({
            agent_id: input.agent_id,
            type: input.type,
            content: input.content,
            confidence,
            tags: input.tags ?? [],
            source_trace_id: input.source_trace_id ?? null,
        })
        .select('id')
        .single();

    if (error) {
        console.error('[memory] Write failed:', error.message);
        return null;
    }

    // Enforce per-agent memory cap
    await enforceMemoryCap(sb, input.agent_id);

    return data?.id ?? null;
}

/**
 * Enforce the memory cap per agent.
 * When an agent has more than `max` memories, delete the oldest ones.
 */
export async function enforceMemoryCap(
    sb: SupabaseClient,
    agentId: string,
    max: number = DEFAULT_MEMORY_CAP,
): Promise<number> {
    const { count } = await sb
        .from('ops_agent_memory')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId)
        .is('superseded_by', null);

    const total = count ?? 0;
    if (total <= max) return 0;

    const toDelete = total - max;

    // Find the oldest memories to delete
    const { data: oldest } = await sb
        .from('ops_agent_memory')
        .select('id')
        .eq('agent_id', agentId)
        .is('superseded_by', null)
        .order('created_at', { ascending: true })
        .limit(toDelete);

    if (!oldest?.length) return 0;

    const ids = oldest.map(m => m.id);
    const { error } = await sb.from('ops_agent_memory').delete().in('id', ids);

    if (error) {
        console.error('[memory] Cap enforcement failed:', error.message);
        return 0;
    }

    console.log(
        `[memory] Capped ${agentId}: deleted ${ids.length} oldest memories`,
    );
    return ids.length;
}

/**
 * Get memories for an agent, using a shared cache to avoid repeated DB hits.
 * A single heartbeat may evaluate multiple triggers for the same agent —
 * this ensures only one DB call per agent per heartbeat cycle.
 */
export async function getCachedMemories(
    sb: SupabaseClient,
    cache: MemoryCache,
    agentId: string,
    types?: MemoryEntry['type'][],
    limit: number = 10,
    minConfidence: number = 0.6,
): Promise<MemoryEntry[]> {
    const cacheKey = agentId;

    if (!cache.has(cacheKey)) {
        // Fetch all types on first call — cache broadly, filter narrowly
        const memories = await queryAgentMemories(sb, {
            agentId,
            limit: 50, // Fetch more than needed, filter client-side
            minConfidence,
        });
        cache.set(cacheKey, memories);
    }

    let memories = cache.get(cacheKey) ?? [];

    // Client-side type filtering
    if (types?.length) {
        memories = memories.filter(m => types.includes(m.type));
    }

    return memories.slice(0, limit);
}

/**
 * Count how many memories an agent has written today.
 */
export async function countTodayMemories(
    sb: SupabaseClient,
    agentId: string,
): Promise<number> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count, error } = await sb
        .from('ops_agent_memory')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId)
        .gte('created_at', todayStart.toISOString());

    if (error) {
        console.error('[memory] Count failed:', error.message);
        return 0;
    }
    return count ?? 0;
}
