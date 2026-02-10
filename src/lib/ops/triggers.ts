// Trigger evaluation — fires proposals based on trigger rules
import { sql } from '@/lib/db';
import type { TriggerRule, TriggerCheckResult } from '../types';
import { createProposalAndMaybeAutoApprove } from './proposal-service';
import { emitEvent } from './events';

export async function evaluateTriggers(
    timeoutMs: number = 4000,
): Promise<{ evaluated: number; fired: number }> {
    const deadline = Date.now() + timeoutMs;

    const rules = await sql<TriggerRule[]>`
        SELECT * FROM ops_trigger_rules WHERE enabled = true
    `;

    let evaluated = 0;
    let fired = 0;

    for (const rule of rules) {
        if (Date.now() >= deadline) break;

        // Cooldown check
        if (rule.last_fired_at && rule.cooldown_minutes > 0) {
            const cooldownEnd =
                new Date(rule.last_fired_at).getTime() +
                rule.cooldown_minutes * 60_000;
            if (Date.now() < cooldownEnd) {
                evaluated++;
                continue;
            }
        }

        try {
            const result = await checkTrigger(rule);
            evaluated++;

            if (result.fired && result.proposal) {
                await createProposalAndMaybeAutoApprove(result.proposal);

                await sql`
                    UPDATE ops_trigger_rules SET
                        fire_count = fire_count + 1,
                        last_fired_at = NOW()
                    WHERE id = ${rule.id}
                `;

                const targetAgent =
                    ((rule.action_config as Record<string, unknown>)
                        .target_agent as string) ?? 'system';

                await emitEvent({
                    agent_id: targetAgent,
                    kind: 'trigger_fired',
                    title: `Trigger fired: ${rule.name}`,
                    summary: result.reason,
                    tags: ['trigger', rule.trigger_event],
                    metadata: { ruleId: rule.id, ruleName: rule.name },
                });

                fired++;
            }
        } catch (err) {
            console.error(
                `[triggers] Error evaluating '${rule.name}':`,
                (err as Error).message,
            );
        }
    }

    return { evaluated, fired };
}

async function checkTrigger(rule: TriggerRule): Promise<TriggerCheckResult> {
    const conditions = rule.conditions as Record<string, unknown>;
    const actionConfig = rule.action_config as Record<string, unknown>;
    const targetAgent = actionConfig.target_agent as string;
    const actionType = actionConfig.action as string;

    switch (rule.trigger_event) {
        case 'mission_failed':
            return checkMissionFailed(conditions, targetAgent, actionType);
        case 'content_published':
            return checkContentPublished(conditions, targetAgent);
        case 'content_marked_public':
            return checkContentMarkedPublic(conditions, targetAgent);
        case 'proactive_scan_signals':
            return checkProactiveScan(conditions, targetAgent);
        case 'work_stalled':
            return checkWorkStalled(conditions, targetAgent);
        case 'proposal_ready':
            return { fired: false };
        case 'mission_milestone_hit':
            return checkMilestoneHit(conditions, targetAgent);
        case 'daily_roundtable':
            return { fired: false };
        case 'memory_consolidation_due':
            return checkMemoryConsolidation(conditions, targetAgent);
        default:
            if (rule.trigger_event.startsWith('proactive_')) {
                return checkProactiveGeneric(rule, targetAgent);
            }
            return { fired: false };
    }
}

async function checkMissionFailed(
    conditions: Record<string, unknown>,
    targetAgent: string,
    _action: string,
): Promise<TriggerCheckResult> {
    const lookback = (conditions.lookback_minutes as number) ?? 60;
    const cutoff = new Date(Date.now() - lookback * 60_000).toISOString();

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_missions
        WHERE status = 'failed' AND updated_at >= ${cutoff}
    `;

    if (count > 0) {
        return {
            fired: true,
            reason: `${count} mission(s) failed in last ${lookback} minutes`,
            proposal: {
                agent_id: targetAgent,
                title: `Diagnose recent mission failure`,
                description: `${count} mission(s) failed recently. Investigate root cause.`,
                proposed_steps: [{ kind: 'audit_system' }],
                source: 'trigger',
            },
        };
    }
    return { fired: false };
}

async function checkContentPublished(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const lookback = (conditions.lookback_minutes as number) ?? 60;
    const cutoff = new Date(Date.now() - lookback * 60_000).toISOString();

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_agent_events
        WHERE kind = 'content_published' AND created_at >= ${cutoff}
    `;

    if (count > 0) {
        return {
            fired: true,
            reason: `${count} content published event(s) in last ${lookback} minutes`,
            proposal: {
                agent_id: targetAgent,
                title: `Review recently published content`,
                proposed_steps: [{ kind: 'critique_content' }],
                source: 'trigger',
            },
        };
    }
    return { fired: false };
}

async function checkContentMarkedPublic(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const lookback = (conditions.lookback_minutes as number) ?? 5;
    const cutoff = new Date(Date.now() - lookback * 60_000).toISOString();

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_agent_events
        WHERE kind = 'content_marked_public' AND created_at >= ${cutoff}
    `;

    if (count > 0) {
        return {
            fired: true,
            reason: `Content marked public — risk assessment needed`,
            proposal: {
                agent_id: targetAgent,
                title: `Risk assessment: content going public`,
                proposed_steps: [{ kind: 'review_policy' }],
                source: 'trigger',
            },
        };
    }
    return { fired: false };
}

async function checkProactiveScan(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const skipProb = (conditions.skip_probability as number) ?? 0.1;
    if (Math.random() < skipProb)
        return { fired: false, reason: 'skipped by probability' };

    const topics = (conditions.topics as string[]) ?? ['general'];
    const topic = topics[Math.floor(Math.random() * topics.length)];

    return {
        fired: true,
        reason: `Proactive signal scan: ${topic}`,
        proposal: {
            agent_id: targetAgent,
            title: `Scan signals: ${topic}`,
            proposed_steps: [{ kind: 'scan_signals', payload: { topic } }],
            source: 'trigger',
        },
    };
}

async function checkWorkStalled(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const stallMinutes = (conditions.stall_minutes as number) ?? 120;
    const cutoff = new Date(Date.now() - stallMinutes * 60_000).toISOString();

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_mission_steps
        WHERE status = 'running' AND updated_at < ${cutoff}
    `;

    if (count > 0) {
        return {
            fired: true,
            reason: `${count} step(s) stalled for ${stallMinutes}+ minutes`,
            proposal: {
                agent_id: targetAgent,
                title: `Reframe stalled work`,
                proposed_steps: [{ kind: 'distill_insight' }],
                source: 'trigger',
            },
        };
    }
    return { fired: false };
}

async function checkMilestoneHit(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const lookback = (conditions.lookback_minutes as number) ?? 30;
    const cutoff = new Date(Date.now() - lookback * 60_000).toISOString();

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_missions
        WHERE status = 'succeeded' AND completed_at >= ${cutoff}
    `;

    if (count > 0) {
        return {
            fired: true,
            reason: `${count} mission(s) completed recently`,
            proposal: {
                agent_id: targetAgent,
                title: `Log milestone completion`,
                proposed_steps: [{ kind: 'document_lesson' }],
                source: 'trigger',
            },
        };
    }
    return { fired: false };
}

async function checkMemoryConsolidation(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const lookbackDays = (conditions.lookback_days as number) ?? 1;
    const cutoff = new Date(
        Date.now() - lookbackDays * 86_400_000,
    ).toISOString();

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_agent_memory
        WHERE created_at >= ${cutoff} AND superseded_by IS NULL
    `;

    if (count >= 10) {
        return {
            fired: true,
            reason: `${count} memories to consolidate`,
            proposal: {
                agent_id: targetAgent,
                title: `Consolidate recent memories`,
                proposed_steps: [{ kind: 'consolidate_memory' }],
                source: 'trigger',
            },
        };
    }
    return { fired: false };
}

async function checkProactiveGeneric(
    rule: TriggerRule,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const conditions = rule.conditions as Record<string, unknown>;
    const skipProb = (conditions.skip_probability as number) ?? 0.1;
    if (Math.random() < skipProb)
        return { fired: false, reason: 'skipped by probability' };

    const topics = (conditions.topics as string[]) ?? [];
    const topic =
        topics.length > 0 ?
            topics[Math.floor(Math.random() * topics.length)]
        :   rule.name;

    return {
        fired: true,
        reason: `Proactive trigger: ${rule.name}`,
        proposal: {
            agent_id: targetAgent,
            title: rule.name.substring(0, 100),
            proposed_steps: [{ kind: 'research_topic', payload: { topic } }],
            source: 'trigger',
        },
    };
}
