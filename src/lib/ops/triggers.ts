// Trigger evaluation — fires proposals based on trigger rules
import { sql } from '@/lib/db';
import type { TriggerRule, TriggerCheckResult, ProposedStep } from '../types';
import { createProposalAndMaybeAutoApprove } from './proposal-service';
import { emitEvent } from './events';
import { getPolicy } from './policy';
import {
    evaluateCondition,
    type TriggerCondition,
} from './condition-evaluator';
import { logger } from '@/lib/logger';
import { AGENT_IDS } from '@/lib/agents';
import { generateAgentProposal } from './agent-designer';

const log = logger.child({ module: 'triggers' });

// Truncation limits for debate topics
const RATIONALE_PREVIEW_LENGTH = 200;
const TOPIC_MAX_LENGTH = 1000;

/** Default thresholds loaded from ops_policy once per evaluation cycle */
interface TriggerDefaults {
    stall_minutes: number;
    failure_rate_threshold: number;
    lookback_hours: number;
}

export async function evaluateTriggers(
    timeoutMs: number = 4000,
): Promise<{ evaluated: number; fired: number }> {
    const deadline = Date.now() + timeoutMs;

    const rules = await sql<TriggerRule[]>`
        SELECT * FROM ops_trigger_rules WHERE enabled = true
    `;

    // Load trigger defaults once per evaluation cycle
    const defaultsPolicy = await getPolicy('trigger_defaults');
    const triggerDefaults: TriggerDefaults = {
        stall_minutes: (defaultsPolicy.stall_minutes as number) ?? 120,
        failure_rate_threshold:
            (defaultsPolicy.failure_rate_threshold as number) ?? 0.3,
        lookback_hours: (defaultsPolicy.lookback_hours as number) ?? 48,
    };

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
            const result = await checkTrigger(rule, triggerDefaults);
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
            log.error(`Error evaluating '${rule.name}'`, {
                error: err,
                ruleId: rule.id,
            });
        }
    }

    return { evaluated, fired };
}

async function checkTrigger(
    rule: TriggerRule,
    defaults: TriggerDefaults,
): Promise<TriggerCheckResult> {
    const conditions = rule.conditions as Record<string, unknown>;
    const actionConfig = rule.action_config as Record<string, unknown>;
    const targetAgent = actionConfig.target_agent as string;
    const actionType = actionConfig.action as string;

    // Declarative condition path — if rule has a JSONB condition, evaluate it
    if (rule.condition) {
        try {
            const met = await evaluateCondition(
                rule.condition as unknown as TriggerCondition,
            );
            if (met) {
                return {
                    fired: true,
                    reason: `Declarative condition met for ${rule.name}`,
                    proposal: {
                        agent_id: targetAgent,
                        title: (actionConfig.title as string) ?? rule.name,
                        description:
                            (actionConfig.description as string) ?? undefined,
                        proposed_steps:
                            (actionConfig.steps as ProposedStep[]) ?? [
                                { kind: 'log_event' as const },
                            ],
                        source: 'trigger',
                    },
                };
            }
            return { fired: false };
        } catch (err) {
            log.error(
                `Declarative condition evaluation failed for "${rule.name}", falling through to code`,
                {
                    error: err,
                    ruleId: rule.id,
                },
            );
            // Fall through to switch/case as fallback
        }
    }

    switch (rule.trigger_event) {
        case 'mission_failed':
            return checkMissionFailed(conditions, targetAgent, actionType);
        case 'content_draft_created':
            return checkContentDraftCreated(conditions, targetAgent);
        case 'content_published':
            return checkContentPublished(conditions, targetAgent);
        case 'content_marked_public':
            return checkContentMarkedPublic(conditions, targetAgent);
        case 'proactive_scan_signals':
            return checkProactiveScan(conditions, targetAgent);
        case 'work_stalled':
            return checkWorkStalled(conditions, targetAgent, defaults);
        case 'proposal_ready':
            return checkProposalReady(conditions, targetAgent);
        case 'mission_milestone_hit':
            return checkMilestoneHit(conditions, targetAgent);
        case 'daily_roundtable':
            return checkDailyRoundtable(conditions, targetAgent);
        case 'memory_consolidation_due':
            return checkMemoryConsolidation(conditions, targetAgent);
        case 'proactive_proposal_triage':
            return checkProposalTriage(conditions, targetAgent);
        case 'proactive_ops_report':
            return checkOpsReport(conditions, targetAgent);
        case 'strategic_drift_check':
            return checkStrategicDrift(conditions, targetAgent, defaults);
        case 'governance_proposal_created':
            return checkGovernanceProposalCreated(conditions, targetAgent);
        case 'agent_proposal_created':
            return checkAgentProposalCreated(conditions, targetAgent);
        case 'memory_archaeology_due':
            return checkMemoryArchaeologyDue(conditions, targetAgent);
        case 'agent_design_review':
            return checkAgentDesignReview(conditions, targetAgent);
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

async function checkContentDraftCreated(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const lookback = (conditions.lookback_minutes as number) ?? 30;
    const cutoff = new Date(Date.now() - lookback * 60_000).toISOString();

    // Find drafts in 'draft' status created recently that don't have a review session yet
    const drafts = await sql<
        { id: string; title: string; author_agent: string; body: string }[]
    >`
        SELECT id, title, author_agent, LEFT(body, 500) as body
        FROM ops_content_drafts
        WHERE status = 'draft'
          AND review_session_id IS NULL
          AND created_at >= ${cutoff}
        ORDER BY created_at ASC
        LIMIT 1
    `;

    if (drafts.length === 0) {
        return { fired: false };
    }

    const draft = drafts[0];

    // Enqueue a content_review roundtable session
    const topic = `Review content draft: "${draft.title}" by ${draft.author_agent}`;
    const [session] = await sql<[{ id: string }]>`
        INSERT INTO ops_roundtable_sessions (
            format, topic, participants, status, scheduled_for, metadata
        ) VALUES (
            'content_review',
            ${topic},
            ARRAY['subrosa', 'chora', 'praxis'],
            'pending',
            NOW(),
            ${sql.json({ draft_id: draft.id, draft_title: draft.title, author: draft.author_agent })}::jsonb
        )
        RETURNING id
    `;

    // Update draft status to 'review' and link the review session
    await sql`
        UPDATE ops_content_drafts
        SET status = 'review',
            review_session_id = ${session.id},
            updated_at = NOW()
        WHERE id = ${draft.id}
    `;

    log.info('Auto-review triggered for content draft', {
        draftId: draft.id,
        reviewSessionId: session.id,
    });

    return {
        fired: true,
        reason: `Content draft "${draft.title}" sent to review`,
        proposal: {
            agent_id: targetAgent,
            title: `Content review initiated: ${draft.title}`,
            description: `Roundtable review session created for draft by ${draft.author_agent}`,
            proposed_steps: [{ kind: 'log_event' }],
            source: 'trigger',
        },
    };
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
    defaults: TriggerDefaults,
): Promise<TriggerCheckResult> {
    const stallMinutes =
        (conditions.stall_minutes as number) ?? defaults.stall_minutes;
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

    if (count >= 3) {
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

async function checkProposalReady(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const lookback = (conditions.lookback_minutes as number) ?? 30;
    const cutoff = new Date(Date.now() - lookback * 60_000).toISOString();

    const pending = await sql<{ id: string; title: string }[]>`
        SELECT id, title FROM ops_mission_proposals
        WHERE status = 'pending' AND created_at >= ${cutoff}
        ORDER BY created_at ASC
        LIMIT 5
    `;

    if (pending.length > 0) {
        return {
            fired: true,
            reason: `${pending.length} pending proposal(s) awaiting review`,
            proposal: {
                agent_id: targetAgent,
                title: `Review and action pending proposals`,
                description: `${pending.length} proposal(s) waiting: ${pending.map(p => p.title).join(', ')}`,
                proposed_steps: [{ kind: 'review_policy' }],
                source: 'trigger',
            },
        };
    }
    return { fired: false };
}

async function checkDailyRoundtable(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_roundtable_sessions
        WHERE created_at >= ${todayStart.toISOString()}
        AND status IN ('completed', 'running', 'pending')
    `;

    if (count === 0) {
        const participants = (conditions.participants as string[]) ?? [
            'chora',
            'subrosa',
            'thaum',
            'praxis',
        ];
        return {
            fired: true,
            reason: `No roundtable today — convening one`,
            proposal: {
                agent_id: targetAgent,
                title: `Convene daily roundtable`,
                description: `No roundtable has occurred today. Dispatch a session with: ${participants.join(', ')}`,
                proposed_steps: [{ kind: 'log_event' }],
                source: 'trigger',
            },
        };
    }
    return { fired: false };
}

async function checkProposalTriage(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const threshold = (conditions.pending_threshold as number) ?? 10;

    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_mission_proposals
        WHERE status = 'pending'
    `;

    if (count >= threshold) {
        return {
            fired: true,
            reason: `${count} pending proposals (threshold: ${threshold})`,
            proposal: {
                agent_id: targetAgent,
                title: `Triage proposal backlog (${count} pending)`,
                description: `${count} proposals awaiting review. Categorize by urgency and recommend batch actions.`,
                proposed_steps: [
                    {
                        kind: 'audit_system',
                        payload: { scope: 'proposal_backlog' },
                    },
                    {
                        kind: 'document_lesson',
                        payload: { topic: 'proposal_triage_results' },
                    },
                ],
                source: 'trigger',
            },
        };
    }
    return { fired: false };
}

async function checkOpsReport(
    _conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    // Always fires when off cooldown — it's a periodic report
    const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60_000,
    ).toISOString();

    const [stats] = await sql<
        [
            {
                total_missions: number;
                succeeded: number;
                failed: number;
                active_agents: number;
            },
        ]
    >`
        SELECT
            COUNT(*)::int as total_missions,
            COUNT(*) FILTER (WHERE status = 'succeeded')::int as succeeded,
            COUNT(*) FILTER (WHERE status = 'failed')::int as failed,
            COUNT(DISTINCT created_by)::int as active_agents
        FROM ops_missions
        WHERE updated_at >= ${twentyFourHoursAgo}
    `;

    return {
        fired: true,
        reason: `Ops report: ${stats.total_missions} missions (${stats.succeeded} ok, ${stats.failed} failed), ${stats.active_agents} active agents`,
        proposal: {
            agent_id: targetAgent,
            title: `Operational status report`,
            description: `24h summary: ${stats.total_missions} missions (${stats.succeeded} succeeded, ${stats.failed} failed), ${stats.active_agents} active agents. Analyze throughput and agent balance.`,
            proposed_steps: [
                { kind: 'audit_system', payload: { scope: 'ops_health' } },
                {
                    kind: 'document_lesson',
                    payload: { topic: 'ops_status_report' },
                },
            ],
            source: 'trigger',
        },
    };
}

async function checkStrategicDrift(
    conditions: Record<string, unknown>,
    targetAgent: string,
    defaults: TriggerDefaults,
): Promise<TriggerCheckResult> {
    const lookbackHours =
        (conditions.lookback_hours as number) ?? defaults.lookback_hours;
    const failureThreshold =
        (conditions.failure_rate_threshold as number) ??
        defaults.failure_rate_threshold;
    const cutoff = new Date(
        Date.now() - lookbackHours * 60 * 60_000,
    ).toISOString();

    // Check mission failure rate
    const [missionStats] = await sql<[{ total: number; failed: number }]>`
        SELECT
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE status = 'failed')::int as failed
        FROM ops_missions
        WHERE updated_at >= ${cutoff}
        AND status IN ('succeeded', 'failed')
    `;

    const failureRate =
        missionStats.total > 0 ? missionStats.failed / missionStats.total : 0;

    // Check if any strategy roundtable has occurred recently
    const [{ count: strategyCount }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_roundtable_sessions
        WHERE created_at >= ${cutoff}
        AND format = 'strategy'
    `;

    const highFailureRate =
        missionStats.total >= 3 && failureRate > failureThreshold;
    const noStrategySession = strategyCount === 0;

    if (highFailureRate || noStrategySession) {
        const reasons: string[] = [];
        if (highFailureRate)
            reasons.push(
                `failure rate ${(failureRate * 100).toFixed(0)}% (${missionStats.failed}/${missionStats.total})`,
            );
        if (noStrategySession)
            reasons.push(`no strategy session in ${lookbackHours}h`);

        return {
            fired: true,
            reason: `Strategic drift detected: ${reasons.join(', ')}`,
            proposal: {
                agent_id: targetAgent,
                title: `Strategic drift assessment`,
                description: `Drift indicators: ${reasons.join('; ')}. Review alignment of current operations with core objectives.`,
                proposed_steps: [
                    {
                        kind: 'audit_system',
                        payload: { scope: 'strategic_alignment' },
                    },
                    {
                        kind: 'identify_assumption',
                        payload: { scope: 'operational_drift' },
                    },
                ],
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

async function checkGovernanceProposalCreated(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const lookback = (conditions.lookback_minutes as number) ?? 60;
    const cutoff = new Date(Date.now() - lookback * 60_000).toISOString();

    // Find proposals in 'proposed' status that don't yet have a debate session
    const proposals = await sql<
        {
            id: string;
            proposer: string;
            policy_key: string;
            current_value: Record<string, unknown> | null;
            proposed_value: Record<string, unknown>;
            rationale: string;
        }[]
    >`
        SELECT id, proposer, policy_key, current_value, proposed_value, rationale
        FROM ops_governance_proposals
        WHERE status = 'proposed'
          AND debate_session_id IS NULL
          AND created_at >= ${cutoff}
        ORDER BY created_at ASC
        LIMIT 1
    `;

    if (proposals.length === 0) {
        return { fired: false };
    }

    const proposal = proposals[0];

    // Build debate topic
    const currentStr = JSON.stringify(proposal.current_value, null, 0);
    const proposedStr = JSON.stringify(proposal.proposed_value, null, 0);
    const topic = `Governance debate: ${proposal.proposer} proposes changing "${proposal.policy_key}" from ${currentStr} to ${proposedStr}. Rationale: ${proposal.rationale}`;

    // Create a debate roundtable with ALL agents
    const [session] = await sql<[{ id: string }]>`
        INSERT INTO ops_roundtable_sessions (
            format, topic, participants, status, scheduled_for, metadata
        ) VALUES (
            'debate',
            ${topic.slice(0, 1000)},
            ${AGENT_IDS},
            'pending',
            NOW(),
            ${sql.json({
                governance_proposal_id: proposal.id,
                policy_key: proposal.policy_key,
                proposer: proposal.proposer,
            })}::jsonb
        )
        RETURNING id
    `;

    // Update proposal: status → voting, link debate session
    await sql`
        UPDATE ops_governance_proposals
        SET status = 'voting', debate_session_id = ${session.id}
        WHERE id = ${proposal.id}
    `;

    log.info('Governance debate session created', {
        proposalId: proposal.id,
        sessionId: session.id,
        policyKey: proposal.policy_key,
    });

    return {
        fired: true,
        reason: `Governance debate convened for "${proposal.policy_key}" (proposed by ${proposal.proposer})`,
        proposal: {
            agent_id: targetAgent,
            title: `Governance debate: ${proposal.policy_key}`,
            description: `Debate roundtable created for proposal by ${proposal.proposer}`,
            proposed_steps: [{ kind: 'log_event' }],
            source: 'trigger',
        },
    };
}

// ─── Agent Proposal Created ───

async function checkAgentProposalCreated(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const lookback = (conditions.lookback_minutes as number) ?? 60;
    const cutoff = new Date(Date.now() - lookback * 60_000).toISOString();

    // Find agent proposals in 'proposed' status that don't yet have a debate session
    const proposals = await sql<
        {
            id: string;
            proposed_by: string;
            agent_name: string;
            agent_role: string;
            rationale: string;
        }[]
    >`
        SELECT id, proposed_by, agent_name, agent_role, rationale
        FROM ops_agent_proposals
        WHERE status = 'proposed'
          AND created_at >= ${cutoff}
        ORDER BY created_at ASC
        LIMIT 1
    `;

    if (proposals.length === 0) {
        return { fired: false };
    }

    const proposal = proposals[0];

    // Build debate topic (with ellipsis if truncated, staying within length limit)
    const rationalePreview =
        proposal.rationale.length > RATIONALE_PREVIEW_LENGTH ?
            proposal.rationale.slice(0, RATIONALE_PREVIEW_LENGTH - 3) + '...'
        :   proposal.rationale;
    const topic = `Agent Design Review: ${proposal.proposed_by} proposes new agent "${proposal.agent_name}" (${proposal.agent_role}). Rationale: ${rationalePreview}`;

    // Create a debate roundtable with ALL agents (topic truncated with ellipsis if needed)
    const topicTruncated =
        topic.length > TOPIC_MAX_LENGTH ?
            topic.slice(0, TOPIC_MAX_LENGTH - 3) + '...'
        :   topic;
    const [session] = await sql<[{ id: string }]>`
        INSERT INTO ops_roundtable_sessions (
            format, topic, participants, status, scheduled_for, metadata
        ) VALUES (
            'debate',
            ${topicTruncated},
            ${AGENT_IDS},
            'pending',
            NOW(),
            ${sql.json({
                agent_proposal_id: proposal.id,
                agent_name: proposal.agent_name,
                proposer: proposal.proposed_by,
            })}::jsonb
        )
        RETURNING id
    `;

    // Update proposal: status → voting (linking is not in the schema, so we just transition status)
    await sql`
        UPDATE ops_agent_proposals
        SET status = 'voting'
        WHERE id = ${proposal.id}
    `;

    log.info('Agent proposal debate session created', {
        proposalId: proposal.id,
        sessionId: session.id,
        agentName: proposal.agent_name,
    });

    return {
        fired: true,
        reason: `Agent proposal debate convened for "${proposal.agent_name}" (proposed by ${proposal.proposed_by})`,
        proposal: {
            agent_id: targetAgent,
            title: `Agent debate: ${proposal.agent_name}`,
            description: `Debate roundtable created for agent proposal by ${proposal.proposed_by}`,
            proposed_steps: [{ kind: 'log_event' }],
            source: 'trigger',
        },
    };
}

// ─── Memory Archaeology ───

async function checkMemoryArchaeologyDue(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const minDaysBetweenDigs =
        (conditions.min_days_between_digs as number) ?? 7;
    const cutoff = new Date(
        Date.now() - minDaysBetweenDigs * 86_400_000,
    ).toISOString();

    // Check if a dig has been performed recently
    const [{ count }] = await sql<[{ count: number }]>`
        SELECT COUNT(DISTINCT dig_id)::int as count
        FROM ops_memory_archaeology
        WHERE created_at >= ${cutoff}
    `;

    if (count > 0) {
        return { fired: false };
    }

    // Check there are enough memories to analyze
    const [{ memCount }] = await sql<[{ memCount: number }]>`
        SELECT COUNT(*)::int as "memCount"
        FROM ops_agent_memory
        WHERE superseded_by IS NULL
    `;

    if (memCount < 10) {
        return { fired: false };
    }

    return {
        fired: true,
        reason: `No archaeological dig in ${minDaysBetweenDigs} days — ${memCount} memories available for analysis`,
        proposal: {
            agent_id: targetAgent,
            title: 'Weekly memory archaeology dig',
            description: `Deep analysis of ${memCount} collective memories for patterns, contradictions, and drift`,
            proposed_steps: [{ kind: 'memory_archaeology' }],
            source: 'trigger',
        },
    };
}

// ─── Agent Design Review ───

async function checkAgentDesignReview(
    conditions: Record<string, unknown>,
    targetAgent: string,
): Promise<TriggerCheckResult> {
    const minAgents = (conditions.min_agents_before_proposing as number) ?? 4;
    const maxPending = (conditions.max_pending_proposals as number) ?? 2;

    // Check if we have enough active agents
    const [{ agentCount }] = await sql<[{ agentCount: number }]>`
        SELECT COUNT(*)::int as "agentCount"
        FROM ops_agent_registry
        WHERE active = true
    `;

    if (agentCount < minAgents) {
        return {
            fired: false,
            reason: `Only ${agentCount} active agents (minimum ${minAgents} required)`,
        };
    }

    // Check for pending proposals to avoid overwhelming the collective
    const [{ pendingCount }] = await sql<[{ pendingCount: number }]>`
        SELECT COUNT(*)::int as "pendingCount"
        FROM ops_agent_proposals
        WHERE status IN ('proposed', 'voting')
    `;

    if (pendingCount >= maxPending) {
        return {
            fired: false,
            reason: `${pendingCount} agent proposals already pending (max ${maxPending})`,
        };
    }

    // Trigger fires — actually generate the proposal
    try {
        const proposal = await generateAgentProposal(targetAgent);
        log.info('Agent design review completed', {
            proposalId: proposal.id,
            agentName: proposal.agent_name,
            proposer: targetAgent,
        });

        return {
            fired: true,
            reason: `${targetAgent} proposed new agent: ${proposal.agent_name}`,
            proposal: {
                agent_id: targetAgent,
                title: `Agent design proposal: ${proposal.agent_name}`,
                description: proposal.rationale,
                proposed_steps: [{ kind: 'log_event' }],
                source: 'trigger',
            },
        };
    } catch (err) {
        log.error('Agent design review failed', {
            error: err,
            targetAgent,
        });
        return {
            fired: false,
            reason: `Agent design failed: ${(err as Error).message}`,
        };
    }
}
