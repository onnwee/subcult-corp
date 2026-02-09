// Agent Relationships — dynamic affinity between agent pairs
// Affinity drifts after conversations based on interaction quality.
// Range: 0.10 (barely speaking) to 0.95 (closest allies)
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    AgentRelationship,
    PairwiseDrift,
    DriftLogEntry,
    InteractionType,
} from '../types';

const AFFINITY_FLOOR = 0.1;
const AFFINITY_CEILING = 0.95;
const MAX_DRIFT_PER_CONVERSATION = 0.03;
const MAX_DRIFT_LOG_ENTRIES = 20;

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Ensure agent_a < agent_b (alphabetical) for canonical pair ordering */
function sortPair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
}

/**
 * Get the relationship between two agents.
 * Returns null if no relationship exists.
 */
export async function getRelationship(
    sb: SupabaseClient,
    agentA: string,
    agentB: string,
): Promise<AgentRelationship | null> {
    const [a, b] = sortPair(agentA, agentB);

    const { data, error } = await sb
        .from('ops_agent_relationships')
        .select('*')
        .eq('agent_a', a)
        .eq('agent_b', b)
        .single();

    if (error || !data) return null;
    return data as AgentRelationship;
}

/**
 * Get the affinity value between two agents.
 * Returns the default (0.50) if no relationship record exists.
 */
export async function getAffinity(
    sb: SupabaseClient,
    agentA: string,
    agentB: string,
): Promise<number> {
    if (agentA === agentB) return 1.0;
    const rel = await getRelationship(sb, agentA, agentB);
    return rel?.affinity ?? 0.5;
}

/**
 * Get all relationships for a specific agent.
 */
export async function getAgentRelationships(
    sb: SupabaseClient,
    agentId: string,
): Promise<AgentRelationship[]> {
    const { data, error } = await sb
        .from('ops_agent_relationships')
        .select('*')
        .or(`agent_a.eq.${agentId},agent_b.eq.${agentId}`);

    if (error || !data) return [];
    return data as AgentRelationship[];
}

/**
 * Load all affinities into a lookup map for efficient access.
 * Key format: "agentA:agentB" (alphabetically sorted).
 */
export async function loadAffinityMap(
    sb: SupabaseClient,
): Promise<Map<string, number>> {
    const { data, error } = await sb
        .from('ops_agent_relationships')
        .select('agent_a, agent_b, affinity');

    const map = new Map<string, number>();
    if (error || !data) return map;

    for (const row of data) {
        const key = `${row.agent_a}:${row.agent_b}`;
        map.set(key, Number(row.affinity));
    }

    return map;
}

/**
 * Look up affinity from a preloaded map.
 */
export function getAffinityFromMap(
    map: Map<string, number>,
    agentA: string,
    agentB: string,
): number {
    if (agentA === agentB) return 1.0;
    const [a, b] = sortPair(agentA, agentB);
    return map.get(`${a}:${b}`) ?? 0.5;
}

/**
 * Apply pairwise relationship drifts after a conversation.
 * Each drift is clamped to ±0.03 per conversation.
 * Affinity stays within [0.10, 0.95].
 * Keeps the last 20 drift_log entries.
 */
export async function applyPairwiseDrifts(
    sb: SupabaseClient,
    drifts: PairwiseDrift[],
    conversationId: string,
): Promise<{ applied: number }> {
    let applied = 0;

    for (const { agent_a, agent_b, drift, reason } of drifts) {
        const [a, b] = sortPair(agent_a, agent_b);
        const clampedDrift = clamp(
            drift,
            -MAX_DRIFT_PER_CONVERSATION,
            MAX_DRIFT_PER_CONVERSATION,
        );

        // Fetch current relationship
        const { data: current } = await sb
            .from('ops_agent_relationships')
            .select(
                'affinity, total_interactions, positive_interactions, negative_interactions, drift_log',
            )
            .eq('agent_a', a)
            .eq('agent_b', b)
            .single();

        if (!current) {
            console.warn(
                `[relationships] No relationship found for ${a} ↔ ${b}, skipping drift`,
            );
            continue;
        }

        const currentAffinity = Number(current.affinity);
        const newAffinity = clamp(
            currentAffinity + clampedDrift,
            AFFINITY_FLOOR,
            AFFINITY_CEILING,
        );

        // Build new drift log entry
        const logEntry: DriftLogEntry = {
            drift: clampedDrift,
            reason,
            conversationId,
            at: new Date().toISOString(),
        };

        const existingLog =
            Array.isArray(current.drift_log) ?
                (current.drift_log as DriftLogEntry[])
            :   [];
        const newLog = [
            ...existingLog.slice(-(MAX_DRIFT_LOG_ENTRIES - 1)),
            logEntry,
        ];

        // Update interaction counters
        const isPositive = clampedDrift > 0;
        const isNegative = clampedDrift < 0;

        const { error } = await sb
            .from('ops_agent_relationships')
            .update({
                affinity: newAffinity,
                total_interactions: (current.total_interactions ?? 0) + 1,
                positive_interactions:
                    (current.positive_interactions ?? 0) + (isPositive ? 1 : 0),
                negative_interactions:
                    (current.negative_interactions ?? 0) + (isNegative ? 1 : 0),
                drift_log: newLog,
            })
            .eq('agent_a', a)
            .eq('agent_b', b);

        if (error) {
            console.error(
                `[relationships] Failed to update ${a} ↔ ${b}:`,
                error.message,
            );
        } else {
            applied++;
            console.log(
                `[relationships] ${a} ↔ ${b}: ${currentAffinity.toFixed(2)} → ${newAffinity.toFixed(2)} (${clampedDrift > 0 ? '+' : ''}${clampedDrift.toFixed(3)}: ${reason})`,
            );
        }
    }

    return { applied };
}

/**
 * Determine the interaction type based on affinity between two agents.
 * High affinity → more supportive/agreeable.
 * Low affinity → more critical/challenging.
 */
export function getInteractionType(affinity: number): InteractionType {
    const tension = 1 - affinity;

    if (tension > 0.6) {
        // High tension → 20% chance of direct challenge
        return Math.random() < 0.2 ? 'challenge' : 'critical';
    } else if (tension > 0.3) {
        // Medium tension → neutral
        return 'neutral';
    } else {
        // Low tension → 40% chance of supportive
        return Math.random() < 0.4 ? 'supportive' : 'agreement';
    }
}
