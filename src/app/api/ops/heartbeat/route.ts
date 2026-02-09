// /api/ops/heartbeat — The system's pulse
// Fires every 5 minutes via cron. Evaluates triggers, processes reactions,
// recovers stale steps. Each phase is try-catch'd so one failure won't crash the rest.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { evaluateTriggers } from '@/lib/ops/triggers';
import { processReactionQueue } from '@/lib/ops/reaction-matrix';
import { recoverStaleSteps } from '@/lib/ops/recovery';
import { getPolicy } from '@/lib/ops/policy';
import { checkScheduleAndEnqueue } from '@/lib/roundtable/orchestrator';
import { learnFromOutcomes } from '@/lib/ops/outcome-learner';

export const dynamic = 'force-dynamic';
export const maxDuration = 25; // seconds (Vercel limit)

export async function GET(req: NextRequest) {
    const startTime = Date.now();

    // ── Auth check ──
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = getServiceClient();

    // ── Kill switch check ──
    const systemPolicy = await getPolicy(sb, 'system_enabled');
    if (!(systemPolicy.enabled as boolean)) {
        return NextResponse.json({
            status: 'disabled',
            message: 'System is disabled via policy',
        });
    }

    const results: Record<string, unknown> = {};

    // ── Phase 1: Evaluate triggers ──
    try {
        results.triggers = await evaluateTriggers(sb, 4000);
    } catch (err) {
        results.triggers = { error: (err as Error).message };
        console.error('[heartbeat] Trigger evaluation failed:', err);
    }

    // ── Phase 2: Process reaction queue ──
    try {
        results.reactions = await processReactionQueue(sb, 3000);
    } catch (err) {
        results.reactions = { error: (err as Error).message };
        console.error('[heartbeat] Reaction processing failed:', err);
    }

    // ── Phase 3: Recover stale steps ──
    try {
        results.stale = await recoverStaleSteps(sb);
    } catch (err) {
        results.stale = { error: (err as Error).message };
        console.error('[heartbeat] Stale recovery failed:', err);
    }

    // ── Phase 4: Check roundtable schedule ──
    try {
        results.roundtable = await checkScheduleAndEnqueue(sb);
    } catch (err) {
        results.roundtable = { error: (err as Error).message };
        console.error('[heartbeat] Roundtable schedule check failed:', err);
    }

    // ── Phase 5: Learn from outcomes ──
    try {
        results.learning = await learnFromOutcomes(sb);
    } catch (err) {
        results.learning = { error: (err as Error).message };
        console.error('[heartbeat] Outcome learning failed:', err);
    }

    const durationMs = Date.now() - startTime;

    // ── Write audit log ──
    try {
        await sb.from('ops_action_runs').insert({
            action: 'heartbeat',
            status: 'succeeded',
            result: results,
            duration_ms: durationMs,
        });
    } catch (err) {
        console.error('[heartbeat] Failed to write audit log:', err);
    }

    return NextResponse.json({
        status: 'ok',
        duration_ms: durationMs,
        ...results,
    });
}
