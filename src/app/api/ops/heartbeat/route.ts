// /api/ops/heartbeat — The system's pulse
// Fires every 5 minutes via cron. Evaluates triggers, processes reactions,
// recovers stale steps. Each phase is try-catch'd so one failure won't crash the rest.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { evaluateTriggers } from '@/lib/ops/triggers';
import { processReactionQueue } from '@/lib/ops/reaction-matrix';
import { recoverStaleSteps } from '@/lib/ops/recovery';
import { getPolicy } from '@/lib/ops/policy';
import { checkScheduleAndEnqueue } from '@/lib/roundtable/orchestrator';
import { learnFromOutcomes } from '@/lib/ops/outcome-learner';
import { checkAndQueueInitiatives } from '@/lib/ops/initiative';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const startTime = Date.now();

    // ── Auth check ──
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Kill switch check ──
    const systemPolicy = await getPolicy('system_enabled');
    if (!(systemPolicy.enabled as boolean)) {
        return NextResponse.json({
            status: 'disabled',
            message: 'System is disabled via policy',
        });
    }

    const results: Record<string, unknown> = {};

    // ── Phase 1: Evaluate triggers ──
    try {
        results.triggers = await evaluateTriggers(4000);
    } catch (err) {
        results.triggers = { error: (err as Error).message };
        console.error('[heartbeat] Trigger evaluation failed:', err);
    }

    // ── Phase 2: Process reaction queue ──
    try {
        results.reactions = await processReactionQueue(3000);
    } catch (err) {
        results.reactions = { error: (err as Error).message };
        console.error('[heartbeat] Reaction processing failed:', err);
    }

    // ── Phase 3: Recover stale steps ──
    try {
        results.stale = await recoverStaleSteps();
    } catch (err) {
        results.stale = { error: (err as Error).message };
        console.error('[heartbeat] Stale recovery failed:', err);
    }

    // ── Phase 4: Check roundtable schedule ──
    try {
        results.roundtable = await checkScheduleAndEnqueue();
    } catch (err) {
        results.roundtable = { error: (err as Error).message };
        console.error('[heartbeat] Roundtable schedule check failed:', err);
    }

    // ── Phase 5: Learn from outcomes ──
    try {
        results.learning = await learnFromOutcomes();
    } catch (err) {
        results.learning = { error: (err as Error).message };
        console.error('[heartbeat] Outcome learning failed:', err);
    }

    // ── Phase 6: Queue agent initiatives ──
    try {
        results.initiatives = await checkAndQueueInitiatives();
    } catch (err) {
        results.initiatives = { error: (err as Error).message };
        console.error('[heartbeat] Initiative queueing failed:', err);
    }

    const durationMs = Date.now() - startTime;

    // ── Write audit log ──
    try {
        await sql`
            INSERT INTO ops_action_runs (action, status, result, duration_ms)
            VALUES ('heartbeat', 'succeeded', ${JSON.stringify(results)}::jsonb, ${durationMs})
        `;
    } catch (err) {
        console.error('[heartbeat] Failed to write audit log:', err);
    }

    return NextResponse.json({
        status: 'ok',
        duration_ms: durationMs,
        ...results,
    });
}
