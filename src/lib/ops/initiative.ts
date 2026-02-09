// Initiative System — agent-driven proposal generation
// Heartbeat checks which agents qualify for initiative slots.
// Qualifying agents get queued; the VPS initiative-worker picks them up,
// uses LLM to generate a proposal, and submits it through proposal-service.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InitiativeQueueEntry, MemoryEntry } from '../types';
import { AGENT_IDS } from '../agents';
import { queryAgentMemories } from './memory';

/** Minimum hours between initiative attempts for the same agent */
const INITIATIVE_COOLDOWN_HOURS = 4;

/** Minimum high-confidence memories required before an agent can propose */
const MIN_HIGH_CONFIDENCE_MEMORIES = 5;
const HIGH_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Check whether a single agent qualifies for an initiative slot.
 * Requirements:
 *   1. No queue entry in the last INITIATIVE_COOLDOWN_HOURS
 *   2. At least MIN_HIGH_CONFIDENCE_MEMORIES high-confidence memories
 *   3. At least one "lesson" type memory (agent has learned something)
 *
 * If qualified, inserts a row into ops_initiative_queue with status 'pending'
 * and a context snapshot of the agent's top memories.
 *
 * @returns The queue entry ID if enqueued, null otherwise
 */
export async function maybeQueueInitiative(
    sb: SupabaseClient,
    agentId: string,
): Promise<string | null> {
    // ── Cooldown check ──
    const cooldownCutoff = new Date(
        Date.now() - INITIATIVE_COOLDOWN_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const { count: recentCount } = await sb
        .from('ops_initiative_queue')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId)
        .gte('created_at', cooldownCutoff);

    if ((recentCount ?? 0) > 0) {
        return null; // Still in cooldown
    }

    // ── Memory prerequisites ──
    const highConfidenceMemories = await queryAgentMemories(sb, {
        agentId,
        minConfidence: HIGH_CONFIDENCE_THRESHOLD,
        limit: MIN_HIGH_CONFIDENCE_MEMORIES,
    });

    if (highConfidenceMemories.length < MIN_HIGH_CONFIDENCE_MEMORIES) {
        return null; // Not enough high-confidence memories
    }

    // Must have at least one lesson-type memory
    const lessons = await queryAgentMemories(sb, {
        agentId,
        types: ['lesson'],
        limit: 1,
        minConfidence: 0.55,
    });

    if (lessons.length === 0) {
        return null; // No lessons learned yet
    }

    // ── Build context snapshot ──
    // Gather a broader set of memories to feed the initiative worker
    const topMemories = await queryAgentMemories(sb, {
        agentId,
        limit: 15,
        minConfidence: 0.6,
    });

    const context: Record<string, unknown> = {
        agent_id: agentId,
        memory_count: topMemories.length,
        memories: topMemories.map((m: MemoryEntry) => ({
            type: m.type,
            content: m.content,
            confidence: m.confidence,
            tags: m.tags,
        })),
        queued_at: new Date().toISOString(),
    };

    // ── Enqueue ──
    const { data, error } = await sb
        .from('ops_initiative_queue')
        .insert({
            agent_id: agentId,
            status: 'pending',
            context,
        })
        .select('id')
        .single();

    if (error) {
        console.error(
            `[initiative] Failed to enqueue ${agentId}:`,
            error.message,
        );
        return null;
    }

    console.log(`[initiative] Queued initiative for ${agentId}: ${data.id}`);
    return data.id;
}

/**
 * Check all agents and queue initiatives for those that qualify.
 * Called by the heartbeat (Phase 6).
 *
 * @returns Number of agents queued
 */
export async function checkAndQueueInitiatives(
    sb: SupabaseClient,
): Promise<{ checked: number; queued: number }> {
    let queued = 0;

    for (const agentId of AGENT_IDS) {
        try {
            const id = await maybeQueueInitiative(sb, agentId);
            if (id) queued++;
        } catch (err) {
            console.error(
                `[initiative] Error checking ${agentId}:`,
                (err as Error).message,
            );
        }
    }

    return { checked: AGENT_IDS.length, queued };
}

/**
 * Claim a pending initiative entry atomically.
 * Used by the VPS initiative-worker.
 *
 * @returns The claimed entry, or null if none available
 */
export async function claimNextInitiative(
    sb: SupabaseClient,
): Promise<InitiativeQueueEntry | null> {
    // Find the oldest pending entry
    const { data: pending } = await sb
        .from('ops_initiative_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);

    if (!pending?.length) return null;

    const entry = pending[0] as InitiativeQueueEntry;

    // Atomic claim — only update if still pending
    const { data: claimed, error } = await sb
        .from('ops_initiative_queue')
        .update({ status: 'processing' })
        .eq('id', entry.id)
        .eq('status', 'pending')
        .select('*')
        .single();

    if (error || !claimed) return null;

    return claimed as InitiativeQueueEntry;
}

/**
 * Mark an initiative entry as completed with its result.
 */
export async function completeInitiative(
    sb: SupabaseClient,
    entryId: string,
    result: Record<string, unknown>,
): Promise<void> {
    await sb
        .from('ops_initiative_queue')
        .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            result,
        })
        .eq('id', entryId);
}

/**
 * Mark an initiative entry as failed.
 */
export async function failInitiative(
    sb: SupabaseClient,
    entryId: string,
    error: string,
): Promise<void> {
    await sb
        .from('ops_initiative_queue')
        .update({
            status: 'failed',
            processed_at: new Date().toISOString(),
            result: { error },
        })
        .eq('id', entryId);
}
