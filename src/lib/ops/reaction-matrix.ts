// Reaction Matrix — agents responding to each other's events
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventInput, ReactionMatrix, StepKind } from '../types';
import { getPolicy } from './policy';

/**
 * Check if an event should trigger any agent reactions.
 * Writes matching reactions to ops_agent_reactions queue.
 */
export async function checkReactionMatrix(
    sb: SupabaseClient,
    eventId: string,
    event: EventInput,
): Promise<number> {
    // Load the reaction matrix from policy
    const matrixPolicy = await getPolicy(sb, 'reaction_matrix');
    const matrix = matrixPolicy as unknown as ReactionMatrix;

    if (!matrix?.patterns?.length) return 0;

    let queued = 0;

    for (const pattern of matrix.patterns) {
        // Source match: '*' matches any, or exact agent_id match
        if (pattern.source !== '*' && pattern.source !== event.agent_id) {
            continue;
        }

        // Don't react to your own events
        if (pattern.target === event.agent_id) {
            continue;
        }

        // Tag match: all pattern tags must be present in event tags
        const eventTags = event.tags ?? [];
        const allTagsMatch = pattern.tags.every(t => eventTags.includes(t));
        if (!allTagsMatch) {
            continue;
        }

        // Probability check
        if (Math.random() > pattern.probability) {
            continue;
        }

        // Cooldown check
        const cooldownOk = await checkReactionCooldown(
            sb,
            pattern.target,
            pattern.type,
            pattern.cooldown,
        );
        if (!cooldownOk) {
            continue;
        }

        // Queue the reaction
        const { error } = await sb.from('ops_agent_reactions').insert({
            source_agent: event.agent_id,
            target_agent: pattern.target,
            source_event_id: eventId,
            reaction_type: pattern.type,
            status: 'pending',
            payload: {
                event_title: event.title,
                event_summary: event.summary,
                event_tags: eventTags,
            },
        });

        if (!error) {
            queued++;
        } else {
            console.error(
                '[reaction] Failed to queue reaction:',
                error.message,
            );
        }
    }

    return queued;
}

/**
 * Process queued reactions — turn them into proposals.
 * Called by heartbeat.
 */
export async function processReactionQueue(
    sb: SupabaseClient,
    budgetMs: number = 3000,
): Promise<{ processed: number; created: number }> {
    const startTime = Date.now();
    let processed = 0;
    let created = 0;

    // Fetch pending reactions
    const { data: reactions, error } = await sb
        .from('ops_agent_reactions')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(10);

    if (error || !reactions?.length) {
        return { processed: 0, created: 0 };
    }

    // Lazy import to avoid circular deps
    const { createProposalAndMaybeAutoApprove } =
        await import('./proposal-service');

    for (const reaction of reactions) {
        if (Date.now() - startTime > budgetMs) break;

        try {
            // Mark as processing
            await sb
                .from('ops_agent_reactions')
                .update({ status: 'processing' })
                .eq('id', reaction.id);

            // Create proposal
            const result = await createProposalAndMaybeAutoApprove(sb, {
                agent_id: reaction.target_agent,
                title: `React to: ${reaction.payload?.event_title ?? 'event'}`,
                description: `Reaction (${reaction.reaction_type}) to ${reaction.source_agent}'s activity`,
                proposed_steps: [
                    {
                        kind: mapReactionTypeToStepKind(reaction.reaction_type),
                        payload: {
                            reaction_type: reaction.reaction_type,
                            source_agent: reaction.source_agent,
                            event_context: reaction.payload,
                        },
                    },
                ],
                source: 'reaction',
                source_trace_id: `reaction:${reaction.id}`,
            });

            // Mark completed
            await sb
                .from('ops_agent_reactions')
                .update({
                    status: result.success ? 'completed' : 'failed',
                    processed_at: new Date().toISOString(),
                })
                .eq('id', reaction.id);

            processed++;
            if (result.success && result.missionId) created++;
        } catch (err) {
            console.error('[reaction] Failed to process reaction:', err);
            await sb
                .from('ops_agent_reactions')
                .update({
                    status: 'failed',
                    processed_at: new Date().toISOString(),
                })
                .eq('id', reaction.id);
            processed++;
        }
    }

    return { processed, created };
}

// ─── Helpers ───

function mapReactionTypeToStepKind(reactionType: string): StepKind {
    const mapping: Record<string, StepKind> = {
        diagnose: 'analyze',
        analyze: 'analyze',
        review: 'review',
        celebrate: 'summarize',
        critique: 'review',
        support: 'write_content',
    };
    return mapping[reactionType] ?? 'analyze';
}

async function checkReactionCooldown(
    sb: SupabaseClient,
    targetAgent: string,
    reactionType: string,
    cooldownMinutes: number,
): Promise<boolean> {
    const since = new Date(
        Date.now() - cooldownMinutes * 60 * 1000,
    ).toISOString();

    const { count } = await sb
        .from('ops_agent_reactions')
        .select('id', { count: 'exact', head: true })
        .eq('target_agent', targetAgent)
        .eq('reaction_type', reactionType)
        .gte('created_at', since);

    return (count ?? 0) === 0;
}
