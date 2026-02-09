// Trigger evaluation system
// Heartbeat calls evaluateTriggers() → checks each rule → fires proposals
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    TriggerRule,
    TriggerCheckResult,
    ProposalInput,
    MemoryCache,
} from '../types';
import { createProposalAndMaybeAutoApprove } from './proposal-service';
import { enrichTopicWithMemory } from './memory-enrichment';

// ─── Trigger Checkers ───
// Each trigger_event maps to a checker function

type TriggerChecker = (
    sb: SupabaseClient,
    conditions: Record<string, unknown>,
    actionConfig: Record<string, unknown>,
    memoryCache: MemoryCache,
) => Promise<TriggerCheckResult>;

const TRIGGER_CHECKERS: Record<string, TriggerChecker> = {
    // Reactive triggers
    mission_failed: checkMissionFailed,
    content_published: checkContentPublished,

    // Proactive triggers
    proactive_scan_signals: checkProactiveScanSignals,
    proactive_draft_tweet: checkProactiveDraftTweet,
    proactive_research: checkProactiveResearch,
    proactive_analyze_ops: checkProactiveAnalyzeOps,
};

/**
 * Evaluate all enabled trigger rules within a time budget.
 * Called by heartbeat every 5 minutes.
 */
export async function evaluateTriggers(
    sb: SupabaseClient,
    budgetMs: number = 4000,
): Promise<{ evaluated: number; fired: number }> {
    const startTime = Date.now();
    let evaluated = 0;
    let fired = 0;

    // Shared memory cache — one DB hit per agent across all triggers
    const memoryCache: MemoryCache = new Map();

    // Fetch enabled rules
    const { data: rules, error } = await sb
        .from('ops_trigger_rules')
        .select('*')
        .eq('enabled', true)
        .order('last_fired_at', { ascending: true, nullsFirst: true });

    if (error || !rules) {
        console.error('[triggers] Failed to fetch rules:', error?.message);
        return { evaluated: 0, fired: 0 };
    }

    for (const rule of rules as TriggerRule[]) {
        // Budget check
        if (Date.now() - startTime > budgetMs) {
            console.log(`[triggers] Budget exhausted after ${evaluated} rules`);
            break;
        }

        // Cooldown check (cheap — do first)
        if (rule.last_fired_at) {
            const lastFired = new Date(rule.last_fired_at).getTime();
            const cooldownMs = rule.cooldown_minutes * 60 * 1000;
            if (Date.now() - lastFired < cooldownMs) {
                continue; // Still in cooldown
            }
        }

        // Find checker
        const checker = TRIGGER_CHECKERS[rule.trigger_event];
        if (!checker) {
            console.warn(
                `[triggers] No checker for event: ${rule.trigger_event}`,
            );
            continue;
        }

        try {
            const result = await checker(
                sb,
                rule.conditions,
                rule.action_config,
                memoryCache,
            );
            evaluated++;

            if (result.fired && result.proposal) {
                // Apply skip probability for proactive triggers
                if (rule.trigger_event.startsWith('proactive_')) {
                    const skipProb =
                        (rule.conditions.skip_probability as number) ?? 0.1;
                    if (Math.random() < skipProb) {
                        console.log(
                            `[triggers] Skipped ${rule.name} (skip probability)`,
                        );
                        continue;
                    }

                    // Apply jitter delay (store in metadata, don't actually sleep)
                    const jitterMin =
                        (rule.conditions.jitter_min_minutes as number) ?? 25;
                    const jitterMax =
                        (rule.conditions.jitter_max_minutes as number) ?? 45;
                    const jitter =
                        jitterMin + Math.random() * (jitterMax - jitterMin);
                    result.proposal.description =
                        `${result.proposal.description ?? ''} [jitter: ${Math.round(jitter)}m]`.trim();
                }

                // Create proposal through standard pipeline
                const proposalResult = await createProposalAndMaybeAutoApprove(
                    sb,
                    {
                        ...result.proposal,
                        source: 'trigger',
                        source_trace_id: `trigger:${rule.id}:${Date.now()}`,
                    },
                );

                if (proposalResult.success) {
                    fired++;

                    // Update rule: increment fire_count, set last_fired_at
                    await sb
                        .from('ops_trigger_rules')
                        .update({
                            fire_count: rule.fire_count + 1,
                            last_fired_at: new Date().toISOString(),
                        })
                        .eq('id', rule.id);
                }
            }
        } catch (err) {
            console.error(
                `[triggers] Error checking rule "${rule.name}":`,
                err,
            );
        }
    }

    return { evaluated, fired };
}

// ─── Reactive Trigger Checkers ───

async function checkMissionFailed(
    sb: SupabaseClient,
    conditions: Record<string, unknown>,
    actionConfig: Record<string, unknown>,
    _memoryCache: MemoryCache,
): Promise<TriggerCheckResult> {
    const lookbackMinutes = (conditions.lookback_minutes as number) ?? 60;
    const since = new Date(
        Date.now() - lookbackMinutes * 60 * 1000,
    ).toISOString();

    const { data: failed } = await sb
        .from('ops_missions')
        .select('id, title, failure_reason')
        .eq('status', 'failed')
        .gte('updated_at', since)
        .limit(3);

    if (!failed?.length) return { fired: false };

    const targetAgent = (actionConfig.target_agent as string) ?? 'brain';

    return {
        fired: true,
        proposal: {
            agent_id: targetAgent,
            title: `Diagnose failed mission: ${failed[0].title}`,
            description: `${failed.length} mission(s) failed recently. Reason: ${failed[0].failure_reason ?? 'unknown'}`,
            proposed_steps: [
                {
                    kind: 'analyze',
                    payload: {
                        topic: 'mission-failure-diagnosis',
                        failed_missions: failed.map(f => ({
                            id: f.id,
                            title: f.title,
                        })),
                    },
                },
            ],
        },
    };
}

async function checkContentPublished(
    sb: SupabaseClient,
    conditions: Record<string, unknown>,
    actionConfig: Record<string, unknown>,
    _memoryCache: MemoryCache,
): Promise<TriggerCheckResult> {
    const lookbackMinutes = (conditions.lookback_minutes as number) ?? 60;
    const since = new Date(
        Date.now() - lookbackMinutes * 60 * 1000,
    ).toISOString();

    const { data: events } = await sb
        .from('ops_agent_events')
        .select('id, title, agent_id')
        .eq('kind', 'content_published')
        .gte('created_at', since)
        .limit(3);

    if (!events?.length) return { fired: false };

    const targetAgent = (actionConfig.target_agent as string) ?? 'observer';

    return {
        fired: true,
        proposal: {
            agent_id: targetAgent,
            title: `Review published content`,
            description: `${events.length} piece(s) of content published recently`,
            proposed_steps: [
                {
                    kind: 'review',
                    payload: {
                        topic: 'content-review',
                        event_ids: events.map(e => e.id),
                    },
                },
            ],
        },
    };
}

// ─── Proactive Trigger Checkers ───

async function checkProactiveScanSignals(
    sb: SupabaseClient,
    conditions: Record<string, unknown>,
    actionConfig: Record<string, unknown>,
    memoryCache: MemoryCache,
): Promise<TriggerCheckResult> {
    const topics = (conditions.topics as string[]) ?? [
        'AI trends',
        'emerging tech',
        'startup ecosystem',
        'developer tools',
    ];
    const baseTopic = topics[Math.floor(Math.random() * topics.length)];
    const targetAgent = (actionConfig.target_agent as string) ?? 'brain';

    // Memory enrichment — 30% chance of topic adjustment
    const enrichment = await enrichTopicWithMemory(
        sb,
        targetAgent,
        baseTopic,
        topics,
        memoryCache,
    );
    const topic = enrichment.topic;

    return {
        fired: true,
        proposal: {
            agent_id: targetAgent,
            title: `Scan signals: ${topic}`,
            description: `Proactive intelligence scan on "${topic}"${enrichment.memoryInfluenced ? ' [memory-influenced]' : ''}`,
            proposed_steps: [
                {
                    kind: 'scan_signals',
                    payload: {
                        topic,
                        memoryInfluenced: enrichment.memoryInfluenced,
                    },
                },
            ],
        },
    };
}

async function checkProactiveDraftTweet(
    sb: SupabaseClient,
    conditions: Record<string, unknown>,
    actionConfig: Record<string, unknown>,
    memoryCache: MemoryCache,
): Promise<TriggerCheckResult> {
    const topics = (conditions.topics as string[]) ?? [
        'AI insights',
        'tech commentary',
        'productivity tips',
        'industry observations',
    ];
    const baseTopic = topics[Math.floor(Math.random() * topics.length)];
    const targetAgent = (actionConfig.target_agent as string) ?? 'brain';

    // Memory enrichment — 30% chance of topic adjustment
    const enrichment = await enrichTopicWithMemory(
        sb,
        targetAgent,
        baseTopic,
        topics,
        memoryCache,
    );
    const topic = enrichment.topic;

    return {
        fired: true,
        proposal: {
            agent_id: targetAgent,
            title: `Draft tweet: ${topic}`,
            description: `Proactive tweet draft about "${topic}"${enrichment.memoryInfluenced ? ' [memory-influenced]' : ''}`,
            proposed_steps: [
                {
                    kind: 'draft_tweet',
                    payload: {
                        topic,
                        memoryInfluenced: enrichment.memoryInfluenced,
                    },
                },
            ],
        },
    };
}

async function checkProactiveResearch(
    sb: SupabaseClient,
    conditions: Record<string, unknown>,
    actionConfig: Record<string, unknown>,
    memoryCache: MemoryCache,
): Promise<TriggerCheckResult> {
    const topics = (conditions.topics as string[]) ?? [
        'multi-agent systems',
        'LLM optimization',
        'autonomous workflows',
        'knowledge management',
    ];
    const baseTopic = topics[Math.floor(Math.random() * topics.length)];
    const targetAgent = (actionConfig.target_agent as string) ?? 'brain';

    // Memory enrichment — 30% chance of topic adjustment
    const enrichment = await enrichTopicWithMemory(
        sb,
        targetAgent,
        baseTopic,
        topics,
        memoryCache,
    );
    const topic = enrichment.topic;

    return {
        fired: true,
        proposal: {
            agent_id: targetAgent,
            title: `Deep research: ${topic}`,
            description: `Proactive research initiative on "${topic}"${enrichment.memoryInfluenced ? ' [memory-influenced]' : ''}`,
            proposed_steps: [
                {
                    kind: 'research',
                    payload: {
                        topic,
                        memoryInfluenced: enrichment.memoryInfluenced,
                    },
                },
            ],
        },
    };
}

async function checkProactiveAnalyzeOps(
    sb: SupabaseClient,
    _conditions: Record<string, unknown>,
    actionConfig: Record<string, unknown>,
    _memoryCache: MemoryCache,
): Promise<TriggerCheckResult> {
    const targetAgent = (actionConfig.target_agent as string) ?? 'observer';

    // Check basic system stats for context
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count: eventCount } = await sb
        .from('ops_agent_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString());

    const { count: missionCount } = await sb
        .from('ops_missions')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString());

    return {
        fired: true,
        proposal: {
            agent_id: targetAgent,
            title: 'Analyze system operations',
            description: `System health review — ${eventCount ?? 0} events, ${missionCount ?? 0} missions today`,
            proposed_steps: [
                {
                    kind: 'analyze',
                    payload: {
                        topic: 'system-health',
                        context: {
                            events_today: eventCount ?? 0,
                            missions_today: missionCount ?? 0,
                        },
                    },
                },
            ],
        },
    };
}
