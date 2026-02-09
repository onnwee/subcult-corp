// Cap Gates — check quotas before allowing proposals through
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GateResult, StepKind } from '../types';
import { getPolicy } from './policy';

// ─── Gate Registry ───

type GateChecker = (sb: SupabaseClient) => Promise<GateResult>;

const STEP_KIND_GATES: Partial<Record<StepKind, GateChecker>> = {
    post_tweet: checkPostTweetGate,
    write_content: checkWriteContentGate,
    draft_tweet: checkWriteContentGate,
    deploy: checkDeployGate,
};

/**
 * Check all gates for the proposed steps.
 * Returns the first failing gate, or { ok: true } if all pass.
 */
export async function checkCapGates(
    sb: SupabaseClient,
    stepKinds: StepKind[],
): Promise<GateResult> {
    for (const kind of stepKinds) {
        const checker = STEP_KIND_GATES[kind];
        if (checker) {
            const result = await checker(sb);
            if (!result.ok) {
                return result;
            }
        }
    }
    return { ok: true };
}

// ─── Individual Gate Checkers ───

async function checkPostTweetGate(sb: SupabaseClient): Promise<GateResult> {
    const quota = await getPolicy(sb, 'x_daily_quota');
    const limit = (quota.limit as number) ?? 5;

    const todayCount = await countTodaySteps(sb, 'post_tweet');
    if (todayCount >= limit) {
        return {
            ok: false,
            reason: `Tweet quota full (${todayCount}/${limit})`,
        };
    }
    return { ok: true };
}

async function checkWriteContentGate(sb: SupabaseClient): Promise<GateResult> {
    const policy = await getPolicy(sb, 'content_policy');
    if (!(policy.enabled as boolean)) return { ok: true };

    const maxDrafts = (policy.max_drafts_per_day as number) ?? 8;
    const todayDrafts =
        (await countTodaySteps(sb, 'write_content')) +
        (await countTodaySteps(sb, 'draft_tweet'));

    if (todayDrafts >= maxDrafts) {
        return {
            ok: false,
            reason: `Content quota full (${todayDrafts}/${maxDrafts})`,
        };
    }
    return { ok: true };
}

async function checkDeployGate(_sb: SupabaseClient): Promise<GateResult> {
    // Deploy gate — always blocked unless manually approved
    return {
        ok: false,
        reason: 'Deploy steps require manual approval',
    };
}

// ─── Helpers ───

async function countTodaySteps(
    sb: SupabaseClient,
    kind: StepKind,
): Promise<number> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { count, error } = await sb
        .from('ops_mission_steps')
        .select('id', { count: 'exact', head: true })
        .eq('kind', kind)
        .in('status', ['queued', 'running', 'succeeded'])
        .gte('created_at', todayStart.toISOString());

    if (error) {
        console.error(`[gate] Failed to count ${kind} steps:`, error.message);
        return 0;
    }
    return count ?? 0;
}
