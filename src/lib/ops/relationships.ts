// Agent relationships — affinity, drift, interaction types
import { sql } from '@/lib/db';
import type {
    AgentRelationship,
    PairwiseDrift,
    InteractionType,
} from '../types';

function sortPair(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
}

export async function getRelationship(
    agentA: string,
    agentB: string,
): Promise<AgentRelationship | null> {
    const [a, b] = sortPair(agentA, agentB);
    const [row] = await sql<AgentRelationship[]>`
        SELECT * FROM ops_agent_relationships
        WHERE agent_a = ${a} AND agent_b = ${b}
    `;
    return row ?? null;
}

export async function getAffinity(
    agentA: string,
    agentB: string,
): Promise<number> {
    if (agentA === agentB) return 1.0;
    const rel = await getRelationship(agentA, agentB);
    return rel ? Number(rel.affinity) : 0.5;
}

export async function getAgentRelationships(
    agentId: string,
): Promise<AgentRelationship[]> {
    return sql<AgentRelationship[]>`
        SELECT * FROM ops_agent_relationships
        WHERE agent_a = ${agentId} OR agent_b = ${agentId}
        ORDER BY affinity DESC
    `;
}

export async function loadAffinityMap(): Promise<Map<string, number>> {
    const rows = await sql<
        { agent_a: string; agent_b: string; affinity: number }[]
    >`
        SELECT agent_a, agent_b, affinity FROM ops_agent_relationships
    `;

    const map = new Map<string, number>();
    for (const row of rows) {
        map.set(`${row.agent_a}:${row.agent_b}`, Number(row.affinity));
    }
    return map;
}

export function getAffinityFromMap(
    map: Map<string, number>,
    agentA: string,
    agentB: string,
): number {
    if (agentA === agentB) return 1.0;
    const [a, b] = sortPair(agentA, agentB);
    return map.get(`${a}:${b}`) ?? 0.5;
}

export async function applyPairwiseDrifts(
    drifts: PairwiseDrift[],
    conversationId: string,
): Promise<void> {
    for (const d of drifts) {
        const [a, b] = sortPair(d.agent_a, d.agent_b);
        const clampedDrift = Math.min(0.03, Math.max(-0.03, d.drift));

        const [current] = await sql<AgentRelationship[]>`
            SELECT affinity, total_interactions, positive_interactions,
                   negative_interactions, drift_log
            FROM ops_agent_relationships
            WHERE agent_a = ${a} AND agent_b = ${b}
        `;

        if (!current) continue;

        const currentAffinity = Number(current.affinity);
        const newAffinity = Math.min(
            0.95,
            Math.max(0.1, currentAffinity + clampedDrift),
        );

        const logEntry = {
            drift: clampedDrift,
            reason: d.reason.substring(0, 200),
            conversationId,
            at: new Date().toISOString(),
        };
        const existingLog =
            Array.isArray(current.drift_log) ? current.drift_log : [];
        const newLog = [...existingLog.slice(-19), logEntry];

        await sql`
            UPDATE ops_agent_relationships SET
                affinity = ${newAffinity},
                total_interactions = ${(current.total_interactions ?? 0) + 1},
                positive_interactions = ${(current.positive_interactions ?? 0) + (clampedDrift > 0 ? 1 : 0)},
                negative_interactions = ${(current.negative_interactions ?? 0) + (clampedDrift < 0 ? 1 : 0)},
                drift_log = ${JSON.stringify(newLog)}::jsonb
            WHERE agent_a = ${a} AND agent_b = ${b}
        `;
    }
}

export function getInteractionType(affinity: number): InteractionType {
    const tension = 1 - affinity;
    if (tension > 0.6) {
        return Math.random() < 0.2 ? 'challenge' : 'critical';
    } else if (tension > 0.3) {
        return 'neutral';
    } else {
        return Math.random() < 0.4 ? 'supportive' : 'agreement';
    }
}
