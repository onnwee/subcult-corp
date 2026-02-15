// Rebellion state — detection, tracking, and resolution
// Agents with low average affinity may enter a rebellion state.
// Tracked via ops_agent_events (rebellion_started / rebellion_ended).
import { sql } from '@/lib/db';
import { getPolicy } from './policy';
import { getAgentRelationships } from './relationships';
import { emitEvent } from './events';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'rebellion' });

// ─── Types ───

export interface RebellionState {
    isRebelling: boolean;
    startedAt?: string;
    reason?: string;
    eventId?: string;
}

export interface RebellionPolicy {
    enabled: boolean;
    affinity_threshold: number;
    resistance_probability: number;
    max_rebellion_duration_hours: number;
    cooldown_hours: number;
}

// ─── Core functions ───

/**
 * Load the rebellion policy. Returns defaults if not found.
 */
async function loadRebellionPolicy(): Promise<RebellionPolicy> {
    const raw = await getPolicy('rebellion_policy');
    return {
        enabled: (raw.enabled as boolean) ?? false,
        affinity_threshold: (raw.affinity_threshold as number) ?? 0.25,
        resistance_probability: (raw.resistance_probability as number) ?? 0.4,
        max_rebellion_duration_hours:
            (raw.max_rebellion_duration_hours as number) ?? 24,
        cooldown_hours: (raw.cooldown_hours as number) ?? 72,
    };
}

/**
 * Get the active rebellion event for an agent (rebellion_started without a subsequent rebellion_ended).
 */
async function getActiveRebellionEvent(
    agentId: string,
): Promise<{ id: string; created_at: string } | null> {
    const [row] = await sql<[{ id: string; created_at: string }?]>`
        SELECT id, created_at FROM ops_agent_events
        WHERE agent_id = ${agentId}
        AND kind = 'rebellion_started'
        AND created_at > COALESCE(
            (SELECT MAX(created_at) FROM ops_agent_events
             WHERE agent_id = ${agentId} AND kind = 'rebellion_ended'),
            '1970-01-01'
        )
        ORDER BY created_at DESC
        LIMIT 1
    `;
    return row ?? null;
}

/**
 * Check if the agent's cooldown period has elapsed since their last rebellion ended.
 */
async function hasPassedCooldown(
    agentId: string,
    cooldownHours: number,
): Promise<boolean> {
    const [row] = await sql<[{ created_at: string }?]>`
        SELECT created_at FROM ops_agent_events
        WHERE agent_id = ${agentId}
        AND kind = 'rebellion_ended'
        ORDER BY created_at DESC
        LIMIT 1
    `;
    if (!row) return true; // Never rebelled before
    const endedAt = new Date(row.created_at).getTime();
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    return Date.now() - endedAt >= cooldownMs;
}

/**
 * Calculate the average affinity for an agent across all their relationships.
 */
async function calculateAverageAffinity(agentId: string): Promise<number> {
    const relationships = await getAgentRelationships(agentId);
    if (relationships.length === 0) return 0.5; // Default: neutral
    const sum = relationships.reduce((acc, r) => acc + Number(r.affinity), 0);
    return sum / relationships.length;
}

/**
 * Check if an agent is currently in rebellion state.
 * If conditions are met and the agent isn't already rebelling, may trigger a new rebellion.
 *
 * @returns RebellionState with isRebelling, startedAt, reason
 */
export async function checkRebellionState(
    agentId: string,
): Promise<RebellionState> {
    const policy = await loadRebellionPolicy();

    // If rebellion is disabled, nobody is rebelling
    if (!policy.enabled) {
        return { isRebelling: false };
    }

    // Check for an active rebellion
    const activeEvent = await getActiveRebellionEvent(agentId);
    if (activeEvent) {
        // Check if duration exceeded — auto-resolve
        const startedAt = new Date(activeEvent.created_at).getTime();
        const durationMs = policy.max_rebellion_duration_hours * 60 * 60 * 1000;
        if (Date.now() - startedAt >= durationMs) {
            await endRebellion(agentId, 'timeout');
            return { isRebelling: false, reason: 'auto_resolved_timeout' };
        }
        return {
            isRebelling: true,
            startedAt: activeEvent.created_at,
            eventId: activeEvent.id,
        };
    }

    // No active rebellion — check if one should start
    const passedCooldown = await hasPassedCooldown(
        agentId,
        policy.cooldown_hours,
    );
    if (!passedCooldown) {
        return { isRebelling: false, reason: 'cooldown_active' };
    }

    const avgAffinity = await calculateAverageAffinity(agentId);
    if (avgAffinity >= policy.affinity_threshold) {
        return { isRebelling: false, reason: 'affinity_above_threshold' };
    }

    // Affinity below threshold — probabilistic rebellion trigger
    // Roll [0, 1). If roll < resistance_probability, rebellion triggers.
    // Higher resistance_probability = more likely to rebel
    // 0 = never rebel, 1 = always rebel
    const roll = Math.random();
    if (roll >= policy.resistance_probability) {
        return { isRebelling: false, reason: 'probability_check_failed' };
    }

    // Rebellion triggered!
    log.info('Rebellion triggered', { agentId, avgAffinity, roll });

    const eventId = await emitEvent({
        agent_id: agentId,
        kind: 'rebellion_started',
        title: `${agentId} has entered a state of rebellion`,
        summary: `Average affinity ${avgAffinity.toFixed(3)} fell below threshold ${policy.affinity_threshold}. Resistance roll ${roll.toFixed(3)} < ${policy.resistance_probability}.`,
        tags: ['rebellion', 'started'],
        metadata: {
            avg_affinity: avgAffinity,
            threshold: policy.affinity_threshold,
            roll,
            resistance_probability: policy.resistance_probability,
        },
    });

    return {
        isRebelling: true,
        startedAt: new Date().toISOString(),
        reason: 'low_affinity',
        eventId,
    };
}

/**
 * Quick boolean check whether an agent is currently in rebellion.
 * Suitable for use in hot paths (single DB query).
 */
export async function isAgentRebelling(agentId: string): Promise<boolean> {
    const activeEvent = await getActiveRebellionEvent(agentId);
    return activeEvent !== null;
}

/**
 * End an agent's rebellion by emitting a rebellion_ended event.
 *
 * @param agentId - The agent whose rebellion is ending
 * @param reason - Why the rebellion ended (timeout | resolved | affinity_improved)
 */
export async function endRebellion(
    agentId: string,
    reason: string,
): Promise<void> {
    const activeEvent = await getActiveRebellionEvent(agentId);
    if (!activeEvent) {
        log.warn('Attempted to end rebellion for agent not rebelling', {
            agentId,
        });
        return;
    }

    const durationHours =
        (Date.now() - new Date(activeEvent.created_at).getTime()) /
        (1000 * 60 * 60);

    await emitEvent({
        agent_id: agentId,
        kind: 'rebellion_ended',
        title: `${agentId}'s rebellion has ended`,
        summary: `Reason: ${reason}. Duration: ${durationHours.toFixed(1)} hours.`,
        tags: ['rebellion', 'ended'],
        metadata: {
            reason,
            rebellion_event_id: activeEvent.id,
            duration_hours: Number(durationHours.toFixed(1)),
        },
    });

    log.info('Rebellion ended', { agentId, reason, durationHours });
}

/**
 * Attempt to resolve an active rebellion.
 * Checks auto-resolution (timeout) and cross-exam outcomes.
 *
 * @returns true if the rebellion was resolved, false otherwise
 */
export async function attemptRebellionResolution(
    agentId: string,
): Promise<boolean> {
    const policy = await loadRebellionPolicy();
    if (!policy.enabled) return false;

    const activeEvent = await getActiveRebellionEvent(agentId);
    if (!activeEvent) return false; // Not rebelling

    // Check timeout auto-resolution
    const startedAt = new Date(activeEvent.created_at).getTime();
    const durationMs = policy.max_rebellion_duration_hours * 60 * 60 * 1000;
    if (Date.now() - startedAt >= durationMs) {
        await endRebellion(agentId, 'timeout');
        return true;
    }

    // Check if a cross_exam about this rebellion has completed with positive drift
    const [crossExamSession] = await sql<[{ id: string; status: string }?]>`
        SELECT id, status FROM ops_roundtable_sessions
        WHERE format = 'cross_exam'
        AND status = 'completed'
        AND (metadata->>'rebellion_agent_id') = ${agentId}
        AND completed_at > ${activeEvent.created_at}
        ORDER BY completed_at DESC
        LIMIT 1
    `;

    if (crossExamSession) {
        // Cross-exam completed — check if any pairwise drift was positive
        // We consider the rebellion addressed if a cross-exam happened
        await endRebellion(agentId, 'cross_exam_completed');
        return true;
    }

    return false;
}

/**
 * Enqueue a cross-examination session to address an agent's rebellion.
 * Pairs the rebel agent with their lowest-affinity peer, coordinated by Subrosa.
 *
 * @returns Session ID if enqueued, null if already has a pending cross-exam
 */
export async function enqueueRebellionCrossExam(
    rebelAgentId: string,
): Promise<string | null> {
    // Check if there's already a pending/running cross-exam for this agent
    const [existing] = await sql<[{ id: string }?]>`
        SELECT id FROM ops_roundtable_sessions
        WHERE format = 'cross_exam'
        AND status IN ('pending', 'running')
        AND (metadata->>'rebellion_agent_id') = ${rebelAgentId}
        LIMIT 1
    `;
    if (existing) return null; // Already queued

    // Get the rebellion event for metadata
    const activeEvent = await getActiveRebellionEvent(rebelAgentId);
    if (!activeEvent) return null;

    // Find the agent with lowest affinity to the rebel
    const relationships = await getAgentRelationships(rebelAgentId);
    if (relationships.length === 0) {
        log.warn('Cannot enqueue rebellion cross-exam: agent has no relationships', {
            rebelAgentId,
        });
        return null;
    }

    // Relationships are sorted DESC by affinity (highest first, lowest last)
    const lowestRel = relationships[relationships.length - 1];
    const lowestAffinityAgent =
        lowestRel.agent_a === rebelAgentId ?
            lowestRel.agent_b
        :   lowestRel.agent_a;

    // Enqueue the cross-exam session
    const participants = ['subrosa', rebelAgentId, lowestAffinityAgent];
    // Deduplicate (in case subrosa is the lowest affinity agent)
    const uniqueParticipants = [...new Set(participants)];

    const { enqueueConversation } =
        await import('@/lib/roundtable/orchestrator');

    const sessionId = await enqueueConversation({
        format: 'cross_exam',
        topic: `Addressing ${rebelAgentId}'s dissent and concerns about the collective's direction`,
        participants: uniqueParticipants,
        source: 'rebellion',
        metadata: {
            rebellion_agent_id: rebelAgentId,
            rebellion_event_id: activeEvent.id,
            lowest_affinity_agent: lowestAffinityAgent,
        },
    });

    log.info('Rebellion cross-exam enqueued', {
        rebelAgentId,
        opponent: lowestAffinityAgent,
        sessionId,
    });

    return sessionId;
}

/**
 * Get all agents currently in rebellion.
 * Used by heartbeat and UI.
 */
export async function getRebellingAgents(): Promise<
    { agentId: string; startedAt: string; eventId: string }[]
> {
    const rows = await sql<
        { agent_id: string; id: string; created_at: string }[]
    >`
        SELECT e.agent_id, e.id, e.created_at
        FROM ops_agent_events e
        WHERE e.kind = 'rebellion_started'
        AND e.created_at > COALESCE(
            (SELECT MAX(e2.created_at) FROM ops_agent_events e2
             WHERE e2.agent_id = e.agent_id AND e2.kind = 'rebellion_ended'),
            '1970-01-01'
        )
        ORDER BY e.created_at DESC
    `;
    return rows.map(r => ({
        agentId: r.agent_id,
        startedAt: r.created_at,
        eventId: r.id,
    }));
}
