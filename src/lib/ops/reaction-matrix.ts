// Reaction matrix — event-driven cross-agent reactions
import { sql } from '@/lib/db';
import type { EventInput, ReactionPattern } from '../types';
import { getPolicy } from './policy';
import { createProposalAndMaybeAutoApprove } from './proposal-service';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'reaction-matrix' });

export async function checkReactionMatrix(
    eventId: string,
    input: EventInput,
): Promise<void> {
    try {
        const matrixPolicy = await getPolicy('reaction_matrix');
        const patterns = (matrixPolicy?.patterns ?? []) as ReactionPattern[];

        if (patterns.length === 0) return;

        for (const pattern of patterns) {
            // Source match: '*' matches any, or exact agent_id match
            if (pattern.source !== '*' && pattern.source !== input.agent_id) {
                continue;
            }

            // Tag overlap check
            const eventTags = input.tags ?? [];
            const hasTagOverlap = pattern.tags.some(t => eventTags.includes(t));
            if (!hasTagOverlap) continue;

            // Probability check
            if (Math.random() > pattern.probability) continue;

            // Cooldown check
            const onCooldown = await checkReactionCooldown(
                input.agent_id,
                pattern.target,
                pattern.type,
                pattern.cooldown,
            );
            if (onCooldown) continue;

            // Queue reaction
            await sql`
                INSERT INTO ops_agent_reactions (source_event_id, source_agent, target_agent, reaction_type, status)
                VALUES (${eventId}, ${input.agent_id}, ${pattern.target}, ${pattern.type}, 'queued')
            `;
        }
    } catch (err) {
        log.error('Error checking reactions', { error: err, eventId });
    }
}

export async function processReactionQueue(
    timeoutMs = 3000,
): Promise<{ processed: number; created: number }> {
    const deadline = Date.now() + timeoutMs;
    let processed = 0;
    let created = 0;

    const queued = await sql<
        {
            id: string;
            source_agent: string;
            target_agent: string;
            reaction_type: string;
        }[]
    >`
        SELECT id, source_agent, target_agent, reaction_type
        FROM ops_agent_reactions
        WHERE status = 'queued'
        ORDER BY created_at ASC
        LIMIT 10
    `;

    for (const reaction of queued) {
        if (Date.now() >= deadline) break;

        try {
            // Mark processing
            await sql`
                UPDATE ops_agent_reactions
                SET status = 'processing', updated_at = NOW()
                WHERE id = ${reaction.id}
            `;

            const result = await createProposalAndMaybeAutoApprove({
                agent_id: reaction.target_agent,
                title: `Reaction: ${reaction.reaction_type}`,
                description: `Triggered by ${reaction.source_agent} event`,
                proposed_steps: [{ kind: 'log_event' }],
                source: 'reaction',
                source_trace_id: `reaction:${reaction.id}`,
            });

            await sql`
                UPDATE ops_agent_reactions
                SET status = 'completed', updated_at = NOW()
                WHERE id = ${reaction.id}
            `;

            processed++;
            if (result.success && result.proposalId) created++;
        } catch (err) {
            log.error('Failed to process reaction', {
                error: err,
                reactionId: reaction.id,
            });
            await sql`
                UPDATE ops_agent_reactions
                SET status = 'failed', updated_at = NOW()
                WHERE id = ${reaction.id}
            `;
            processed++;
        }
    }

    return { processed, created };
}

async function checkReactionCooldown(
    source: string,
    target: string,
    type: string,
    cooldownMinutes: number,
): Promise<boolean> {
    if (cooldownMinutes <= 0) return false;

    const cutoff = new Date(Date.now() - cooldownMinutes * 60_000);

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_agent_reactions
        WHERE source_agent = ${source}
        AND target_agent = ${target}
        AND reaction_type = ${type}
        AND created_at >= ${cutoff.toISOString()}
    `;

    return count > 0;
}
