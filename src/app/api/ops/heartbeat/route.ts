// /api/ops/heartbeat — The system's pulse
// Fires every 5 minutes via cron. Evaluates triggers, processes reactions,
// recovers stale steps. Each phase is try-catch'd so one failure won't crash the rest.

import { NextRequest, NextResponse } from 'next/server';
import { sql, jsonb } from '@/lib/db';
import { evaluateTriggers } from '@/lib/ops/triggers';
import { processReactionQueue } from '@/lib/ops/reaction-matrix';
import { recoverStaleSteps } from '@/lib/ops/recovery';
import { getPolicy } from '@/lib/ops/policy';
import { checkScheduleAndEnqueue } from '@/lib/roundtable/orchestrator';
import { learnFromOutcomes } from '@/lib/ops/outcome-learner';
import { checkAndQueueInitiatives } from '@/lib/ops/initiative';
import { checkArtifactFreshness } from '@/lib/ops/artifact-health';
import { checkTemplateHealth } from '@/lib/ops/template-health';
import { evaluateCronSchedules } from '@/lib/ops/cron-scheduler';
import { generateDailyDigest } from '@/lib/ops/digest';
import { runDreamCycle, hasAgentDreamedToday } from '@/lib/ops/dreams';
import {
    getRebellingAgents,
    attemptRebellionResolution,
    enqueueRebellionCrossExam,
} from '@/lib/ops/rebellion';
import { AGENT_IDS } from '@/lib/agents';
import { logger } from '@/lib/logger';
import { withRequestContext } from '@/middleware';

const log = logger.child({ route: 'heartbeat' });

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    return withRequestContext(req, async () => {
        const startTime = Date.now();

        // ── Auth check ──
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 },
            );
        }

        // ── Kill switch check ──
        const systemPolicy = await getPolicy('system_enabled');
        if (!(systemPolicy.enabled as boolean)) {
            return NextResponse.json({
                status: 'disabled',
                message: 'System is disabled via policy',
            });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: Record<string, any> = {};

        // ── Phase 1: Evaluate triggers ──
        try {
            results.triggers = await evaluateTriggers(4000);
        } catch (err) {
            results.triggers = { error: (err as Error).message };
            log.error('Trigger evaluation failed', { error: err });
        }

        // ── Phase 2: Process reaction queue ──
        try {
            results.reactions = await processReactionQueue(3000);
        } catch (err) {
            results.reactions = { error: (err as Error).message };
            log.error('Reaction processing failed', { error: err });
        }

        // ── Phase 3: Recover stale steps ──
        try {
            results.stale = await recoverStaleSteps();
        } catch (err) {
            results.stale = { error: (err as Error).message };
            log.error('Stale recovery failed', { error: err });
        }

        // ── Phase 4: Check roundtable schedule ──
        try {
            results.roundtable = await checkScheduleAndEnqueue();
        } catch (err) {
            results.roundtable = { error: (err as Error).message };
            log.error('Roundtable schedule check failed', { error: err });
        }

        // ── Phase 5: Learn from outcomes ──
        try {
            results.learning = await learnFromOutcomes();
        } catch (err) {
            results.learning = { error: (err as Error).message };
            log.error('Outcome learning failed', { error: err });
        }

        // ── Phase 6: Queue agent initiatives ──
        try {
            results.initiatives = await checkAndQueueInitiatives();
        } catch (err) {
            results.initiatives = { error: (err as Error).message };
            log.error('Initiative queueing failed', { error: err });
        }

        // ── Phase 7: Expire stale proposals ──
        try {
            const expired = await sql`
                UPDATE ops_mission_proposals
                SET status = 'rejected', updated_at = NOW()
                WHERE status = 'pending' AND created_at < NOW() - INTERVAL '7 days'
                RETURNING id
            `;
            results.expired_proposals = expired.length;
            if (expired.length > 0) {
                log.info('Expired stale proposals', { count: expired.length });
            }
        } catch (err) {
            results.expired_proposals = { error: (err as Error).message };
            log.error('Stale proposal expiry failed', { error: err });
        }

        // ── Phase 8: Artifact freshness check ──
        try {
            results.artifacts = await checkArtifactFreshness();
        } catch (err) {
            results.artifacts = { error: (err as Error).message };
            log.error('Artifact freshness check failed', { error: err });
        }

        // ── Phase 9: Evaluate cron schedules ──
        try {
            results.cron = await evaluateCronSchedules();
        } catch (err) {
            results.cron = { error: (err as Error).message };
            log.error('Cron schedule evaluation failed', { error: err });
        }

        // ── Phase 10: Template health check ──
        try {
            results.templateHealth = await checkTemplateHealth();
        } catch (err) {
            results.templateHealth = { error: (err as Error).message };
            log.error('Template health check failed', { error: err });
        }

        // ── Phase 11: Daily digest (once per day, ~11PM CST / 5AM UTC) ──
        try {
            const nowUtc = new Date();
            const cstHour = (nowUtc.getUTCHours() - 6 + 24) % 24; // UTC → CST offset
            if (cstHour >= 22 || cstHour <= 1) {
                // Window around 11PM CST — generateDailyDigest deduplicates internally
                const digestId = await generateDailyDigest();
                results.digest =
                    digestId ?
                        { generated: true, id: digestId }
                    :   { generated: false, reason: 'already_exists' };
            } else {
                results.digest = { generated: false, reason: 'outside_window' };
            }
        } catch (err) {
            results.digest = { error: (err as Error).message };
            log.error('Daily digest generation failed', { error: err });
        }

        // ── Phase 12: Dream cycles (midnight–6AM CST / 6AM–12PM UTC) ──
        try {
            const nowUtc = new Date();
            const cstHour = (nowUtc.getUTCHours() - 6 + 24) % 24;
            if (cstHour >= 0 && cstHour < 6) {
                // Select 1-2 random agents who haven't dreamed today
                const candidates: string[] = [];
                for (const agentId of AGENT_IDS) {
                    if (agentId === 'primus') continue; // primus doesn't dream
                    const dreamed = await hasAgentDreamedToday(agentId);
                    if (!dreamed) candidates.push(agentId);
                }

                if (candidates.length > 0) {
                    // Pick 1-2 random agents
                    const shuffled = candidates.sort(() => Math.random() - 0.5);
                    const dreamCount = Math.min(
                        1 + Math.floor(Math.random() * 2),
                        shuffled.length,
                    );
                    const dreamers = shuffled.slice(0, dreamCount);

                    const dreamResults = [];
                    for (const agentId of dreamers) {
                        const result = await runDreamCycle(agentId);
                        if (result) {
                            dreamResults.push({
                                agentId: result.agentId,
                                dreamType: result.dreamType,
                                dreamId: result.dreamId,
                            });
                        }
                    }
                    results.dreams = {
                        window: true,
                        candidates: candidates.length,
                        dreamers,
                        completed: dreamResults,
                    };
                } else {
                    results.dreams = {
                        window: true,
                        candidates: 0,
                        reason: 'all_agents_dreamed_today',
                    };
                }
            } else {
                results.dreams = {
                    window: false,
                    reason: 'outside_dream_hours',
                };
            }
        } catch (err) {
            results.dreams = { error: (err as Error).message };
            log.error('Dream cycle failed', { error: err });
        }

        // ── Phase 13: Rebellion resolution checks ──
        try {
            const rebels = await getRebellingAgents();
            if (rebels.length > 0) {
                const rebellionResults: Array<{
                    agentId: string;
                    resolved: boolean;
                    crossExamQueued?: boolean;
                }> = [];

                for (const rebel of rebels) {
                    const resolved = await attemptRebellionResolution(
                        rebel.agentId,
                    );
                    if (resolved) {
                        rebellionResults.push({
                            agentId: rebel.agentId,
                            resolved: true,
                        });
                    } else {
                        const sessionId = await enqueueRebellionCrossExam(
                            rebel.agentId,
                        );
                        rebellionResults.push({
                            agentId: rebel.agentId,
                            resolved: false,
                            crossExamQueued: sessionId !== null,
                        });
                    }
                }

                results.rebellions = {
                    active: rebels.length,
                    results: rebellionResults,
                };
            } else {
                results.rebellions = { active: 0 };
            }
        } catch (err) {
            results.rebellions = { error: (err as Error).message };
            log.error('Rebellion resolution check failed', { error: err });
        }

        const durationMs = Date.now() - startTime;

        // ── Write audit log + heartbeat event ──
        try {
            await sql`
            INSERT INTO ops_action_runs (action, status, result, duration_ms)
            VALUES ('heartbeat', 'succeeded', ${jsonb(results)}, ${durationMs})
        `;
            await sql`
            INSERT INTO ops_agent_events (agent_id, kind, title, summary, tags, metadata)
            VALUES (
                'system',
                'heartbeat',
                'System heartbeat',
                ${`${durationMs}ms — ${results.triggers?.evaluated ?? 0} triggers, ${results.roundtable?.enqueued ? '1 enqueued' : 'idle'}`},
                ${sql.array(['heartbeat', 'system'])},
                ${jsonb({ duration_ms: durationMs, ...results })}
            )
        `;
        } catch (err) {
            log.error('Failed to write audit log', { error: err });
        }

        return NextResponse.json({
            status: 'ok',
            duration_ms: durationMs,
            ...results,
        });
    }); // withRequestContext
}
