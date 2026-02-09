// verify-launch.mjs — Pre-flight check for SUBCULT OPS
// Validates database tables, policies, triggers, and connectivity.
//
// Run: node scripts/go-live/verify-launch.mjs

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

// ─── Setup ───

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1';

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) {
    console.log(`  ✓ ${msg}`);
    passed++;
}

function fail(msg) {
    console.error(`  ✗ ${msg}`);
    failed++;
}

function warn(msg) {
    console.log(`  ⚠ ${msg}`);
    warnings++;
}

// ─── Checks ───

async function checkEnvVars() {
    console.log('\n── Environment Variables ──');

    if (SUPABASE_URL) pass(`NEXT_PUBLIC_SUPABASE_URL: ${SUPABASE_URL}`);
    else fail('NEXT_PUBLIC_SUPABASE_URL is not set');

    if (SUPABASE_KEY) pass('SUPABASE_SECRET_KEY is set');
    else fail('SUPABASE_SECRET_KEY is not set');

    if (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)
        pass('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY is set');
    else
        warn(
            'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY is not set (needed for frontend)',
        );

    if (CRON_SECRET) pass('CRON_SECRET is set');
    else
        warn(
            'CRON_SECRET is not set (heartbeat will accept unauthenticated requests)',
        );

    if (LLM_API_KEY) pass('LLM_API_KEY is set');
    else fail('LLM_API_KEY is not set (workers need this)');

    if (LLM_BASE_URL) pass(`LLM_BASE_URL: ${LLM_BASE_URL}`);
}

async function checkTables(sb) {
    console.log('\n── Database Tables ──');

    const requiredTables = [
        'ops_mission_proposals',
        'ops_missions',
        'ops_mission_steps',
        'ops_agent_events',
        'ops_policy',
        'ops_trigger_rules',
        'ops_agent_reactions',
        'ops_action_runs',
        'ops_roundtable_sessions',
        'ops_roundtable_turns',
        'ops_agent_memory',
        'ops_agent_relationships',
        'ops_initiative_queue',
    ];

    for (const table of requiredTables) {
        const { count, error } = await sb
            .from(table)
            .select('*', { count: 'exact', head: true });

        if (error) {
            fail(`${table}: ${error.message}`);
        } else {
            pass(`${table} (${count} rows)`);
        }
    }
}

async function checkPolicies(sb) {
    console.log('\n── Policies ──');

    const requiredPolicies = [
        'auto_approve',
        'x_daily_quota',
        'roundtable_policy',
        'system_enabled',
        'reaction_matrix',
        'memory_influence_policy',
        'relationship_drift_policy',
        'initiative_policy',
    ];

    for (const key of requiredPolicies) {
        const { data, error } = await sb
            .from('ops_policy')
            .select('key, value')
            .eq('key', key)
            .maybeSingle();

        if (error) {
            fail(`Policy "${key}": ${error.message}`);
        } else if (!data) {
            fail(`Policy "${key}" not found — run seed-ops-policy.mjs`);
        } else {
            const enabled = data.value?.enabled;
            const status =
                enabled === true ? '🟢 enabled'
                : enabled === false ? '🔴 disabled'
                : '⚙️ configured';
            pass(`${key}: ${status}`);
        }
    }
}

async function checkTriggers(sb) {
    console.log('\n── Trigger Rules ──');

    const { data, error } = await sb
        .from('ops_trigger_rules')
        .select('name, enabled, fire_count, trigger_event')
        .order('name');

    if (error) {
        fail(`Failed to query trigger rules: ${error.message}`);
        return;
    }

    if (!data || data.length === 0) {
        fail('No trigger rules found — run seed-trigger-rules.mjs');
        return;
    }

    const reactive = data.filter(
        t => !t.trigger_event.startsWith('proactive_'),
    );
    const proactive = data.filter(t =>
        t.trigger_event.startsWith('proactive_'),
    );

    pass(`${reactive.length} reactive trigger(s)`);
    for (const t of reactive) {
        const status = t.enabled ? '🟢' : '🔴';
        console.log(`      ${status} ${t.name} (fired: ${t.fire_count})`);
    }

    pass(`${proactive.length} proactive trigger(s)`);
    for (const t of proactive) {
        const status = t.enabled ? '🟢' : '🔴';
        console.log(`      ${status} ${t.name} (fired: ${t.fire_count})`);
    }
}

async function checkRelationships(sb) {
    console.log('\n── Agent Relationships ──');

    const { data, error } = await sb
        .from('ops_agent_relationships')
        .select('agent_a, agent_b, affinity, total_interactions');

    if (error) {
        fail(`Failed to query relationships: ${error.message}`);
        return;
    }

    if (!data || data.length === 0) {
        fail('No relationships found — run seed-relationships.mjs');
        return;
    }

    // 3 agents = 3 pairs
    const expectedPairs = 3;
    if (data.length >= expectedPairs) {
        pass(`${data.length} relationship pair(s) found`);
    } else {
        warn(`${data.length} pair(s) found, expected ${expectedPairs}`);
    }

    for (const r of data) {
        console.log(
            `      ${r.agent_a} ↔ ${r.agent_b}: affinity ${r.affinity} (${r.total_interactions} interactions)`,
        );
    }
}

async function checkRecentActivity(sb) {
    console.log('\n── Recent Activity ──');

    // Heartbeat runs
    const { data: runs } = await sb
        .from('ops_action_runs')
        .select('action, status, created_at')
        .eq('action', 'heartbeat')
        .order('created_at', { ascending: false })
        .limit(3);

    if (runs && runs.length > 0) {
        pass(`Last heartbeat: ${runs[0].status} at ${runs[0].created_at}`);
    } else {
        warn('No heartbeat runs found yet');
    }

    // Events
    const { count: eventCount } = await sb
        .from('ops_agent_events')
        .select('id', { count: 'exact', head: true });
    if (eventCount && eventCount > 0) {
        pass(`${eventCount} events in the system`);
    } else {
        warn('No events yet — system has not started producing');
    }

    // Conversations
    const { count: convoCount } = await sb
        .from('ops_roundtable_sessions')
        .select('id', { count: 'exact', head: true });
    if (convoCount && convoCount > 0) {
        pass(`${convoCount} conversations recorded`);
    } else {
        warn('No conversations yet — fine if roundtable is disabled');
    }

    // Memories
    const { count: memCount } = await sb
        .from('ops_agent_memory')
        .select('id', { count: 'exact', head: true });
    if (memCount && memCount > 0) {
        pass(`${memCount} memories stored`);
    } else {
        warn('No memories yet — need at least one conversation to generate');
    }

    // Missions
    const { count: missionCount } = await sb
        .from('ops_missions')
        .select('id', { count: 'exact', head: true });
    if (missionCount && missionCount > 0) {
        pass(`${missionCount} missions created`);
    } else {
        warn('No missions yet — proposals need to be approved first');
    }
}

async function checkLLMConnectivity() {
    console.log('\n── LLM API Connectivity ──');

    if (!LLM_API_KEY) {
        fail('Cannot test LLM — LLM_API_KEY is not set');
        return;
    }

    try {
        const res = await fetch(`${LLM_BASE_URL}/models`, {
            headers: { Authorization: `Bearer ${LLM_API_KEY}` },
            signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
            pass(`LLM API reachable at ${LLM_BASE_URL}`);
        } else {
            fail(`LLM API returned ${res.status}: ${res.statusText}`);
        }
    } catch (err) {
        fail(`LLM API unreachable: ${err.message}`);
    }
}

// ─── Main ───

async function main() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║   SUBCULT OPS — Launch Verification  ║');
    console.log('╚══════════════════════════════════════╝');

    await checkEnvVars();

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('\n✗ Cannot proceed without Supabase credentials.');
        process.exit(1);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    await checkTables(sb);
    await checkPolicies(sb);
    await checkTriggers(sb);
    await checkRelationships(sb);
    await checkRecentActivity(sb);
    await checkLLMConnectivity();

    // ─── Summary ───
    console.log('\n══════════════════════════════════════');
    console.log(`  ✓ ${passed} passed`);
    if (warnings > 0) console.log(`  ⚠ ${warnings} warning(s)`);
    if (failed > 0) console.log(`  ✗ ${failed} failed`);
    console.log('══════════════════════════════════════');

    if (failed > 0) {
        console.log('\n❌ Fix the failures above before launching.');
        process.exit(1);
    } else if (warnings > 0) {
        console.log(
            '\n⚠️  System is functional but has warnings. Review above.',
        );
    } else {
        console.log('\n✅ All checks passed — ready to launch!');
    }

    console.log('\n── Launch Order ──');
    console.log('  1. Deploy to Vercel (frontend + heartbeat API)');
    console.log('  2. Set up Vercel cron: /api/ops/heartbeat every 5 min');
    console.log(
        '  3. Start VPS workers: sudo systemctl enable --now subcult-roundtable',
    );
    console.log('  4. Verify heartbeat: check ops_action_runs for new rows');
    console.log('  5. Enable roundtable: set roundtable_policy.enabled = true');
    console.log('  6. Enable proactive triggers one by one');
    console.log('  7. Monitor /stage dashboard');
}

main().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
