// verify-launch.mjs — Pre-flight check for SUBCULT OPS
// Validates database tables, policies, triggers, and connectivity.
//
// Run: node scripts/go-live/verify-launch.mjs

import postgres from 'postgres';
import dotenv from 'dotenv';
import { createLogger } from '../lib/logger.mjs';

dotenv.config({ path: ['.env.local', '.env'] });
const log = createLogger({ service: 'verify-launch' });

// ─── Setup ───

const DATABASE_URL = process.env.DATABASE_URL;
const CRON_SECRET = process.env.CRON_SECRET;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) {
    console.log(`  ✓ ${msg}`);
    passed++;
}

function fail(msg) {
    log.error(msg);
    console.log(`  ✗ ${msg}`);
    failed++;
}

function warn(msg) {
    console.log(`  ⚠ ${msg}`);
    warnings++;
}

// ─── Checks ───

async function checkEnvVars() {
    console.log('\n── Environment Variables ──');

    if (DATABASE_URL) pass('DATABASE_URL is set');
    else fail('DATABASE_URL is not set');

    if (CRON_SECRET) pass('CRON_SECRET is set');
    else
        warn(
            'CRON_SECRET is not set (heartbeat will accept unauthenticated requests)',
        );

    if (OPENROUTER_API_KEY) pass('OPENROUTER_API_KEY is set');
    else fail('OPENROUTER_API_KEY is not set (workers need this)');
}

async function checkTables(sql) {
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
        'ops_agent_registry',
    ];

    for (const table of requiredTables) {
        try {
            const [{ count }] = await sql.unsafe(
                `SELECT COUNT(*)::int as count FROM ${table}`,
            );
            pass(`${table} (${count} rows)`);
        } catch (err) {
            fail(`${table}: ${err.message}`);
        }
    }
}

async function checkPolicies(sql) {
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
        try {
            const [data] = await sql`
                SELECT key, value FROM ops_policy WHERE key = ${key}
            `;

            if (!data) {
                fail(`Policy "${key}" not found — run seed-ops-policy.mjs`);
            } else {
                const enabled = data.value?.enabled;
                const status =
                    enabled === true ? '🟢 enabled'
                    : enabled === false ? '🔴 disabled'
                    : '⚙️ configured';
                pass(`${key}: ${status}`);
            }
        } catch (err) {
            fail(`Policy "${key}": ${err.message}`);
        }
    }
}

async function checkTriggers(sql) {
    console.log('\n── Trigger Rules ──');

    try {
        const data = await sql`
            SELECT name, enabled, fire_count, trigger_event
            FROM ops_trigger_rules
            ORDER BY name
        `;

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
    } catch (err) {
        fail(`Failed to query trigger rules: ${err.message}`);
    }
}

async function checkRelationships(sql) {
    console.log('\n── Agent Relationships ──');

    try {
        const data = await sql`
            SELECT agent_a, agent_b, affinity, total_interactions
            FROM ops_agent_relationships
        `;

        if (!data || data.length === 0) {
            fail('No relationships found — run seed-relationships.mjs');
            return;
        }

        // 5 agents = 10 pairs
        const expectedPairs = 10;
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
    } catch (err) {
        fail(`Failed to query relationships: ${err.message}`);
    }
}

async function checkRecentActivity(sql) {
    console.log('\n── Recent Activity ──');

    // Heartbeat runs
    try {
        const runs = await sql`
            SELECT action, status, created_at FROM ops_action_runs
            WHERE action = 'heartbeat'
            ORDER BY created_at DESC LIMIT 3
        `;

        if (runs && runs.length > 0) {
            pass(`Last heartbeat: ${runs[0].status} at ${runs[0].created_at}`);
        } else {
            warn('No heartbeat runs found yet');
        }
    } catch {
        warn('Could not check heartbeat runs');
    }

    // Events
    try {
        const [{ count }] = await sql`
            SELECT COUNT(*)::int as count FROM ops_agent_events
        `;
        if (count > 0) {
            pass(`${count} events in the system`);
        } else {
            warn('No events yet — system has not started producing');
        }
    } catch {
        warn('Could not check events');
    }

    // Conversations
    try {
        const [{ count }] = await sql`
            SELECT COUNT(*)::int as count FROM ops_roundtable_sessions
        `;
        if (count > 0) {
            pass(`${count} conversations recorded`);
        } else {
            warn('No conversations yet — fine if roundtable is disabled');
        }
    } catch {
        warn('Could not check conversations');
    }

    // Memories
    try {
        const [{ count }] = await sql`
            SELECT COUNT(*)::int as count FROM ops_agent_memory
        `;
        if (count > 0) {
            pass(`${count} memories stored`);
        } else {
            warn(
                'No memories yet — need at least one conversation to generate',
            );
        }
    } catch {
        warn('Could not check memories');
    }

    // Missions
    try {
        const [{ count }] = await sql`
            SELECT COUNT(*)::int as count FROM ops_missions
        `;
        if (count > 0) {
            pass(`${count} missions created`);
        } else {
            warn('No missions yet — proposals need to be approved first');
        }
    } catch {
        warn('Could not check missions');
    }
}

async function checkLLMConnectivity() {
    console.log('\n── LLM API Connectivity ──');

    if (!OPENROUTER_API_KEY) {
        fail('Cannot test LLM — OPENROUTER_API_KEY is not set');
        return;
    }

    try {
        const res = await fetch(`${OPENROUTER_BASE}/models`, {
            headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
            signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
            pass(`OpenRouter API reachable at ${OPENROUTER_BASE}`);
        } else {
            fail(`OpenRouter API returned ${res.status}: ${res.statusText}`);
        }
    } catch (err) {
        fail(`OpenRouter API unreachable: ${err.message}`);
    }
}

// ─── Main ───

async function main() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║   SUBCULT OPS — Launch Verification  ║');
    console.log('╚══════════════════════════════════════╝');

    await checkEnvVars();

    if (!DATABASE_URL) {
        log.fatal('Cannot proceed without DATABASE_URL');
        console.log('\n✗ Cannot proceed without DATABASE_URL.');
        process.exit(1);
    }

    const sql = postgres(DATABASE_URL);

    await checkTables(sql);
    await checkPolicies(sql);
    await checkTriggers(sql);
    await checkRelationships(sql);
    await checkRecentActivity(sql);
    await checkLLMConnectivity();

    await sql.end();

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
    console.log('  1. Build Next.js: npm run build');
    console.log('  2. Start Next.js: npm run start (or via systemd)');
    console.log(
        '  3. Set up crontab: */5 * * * * curl -s http://localhost:3000/api/ops/heartbeat',
    );
    console.log(
        '  4. Start workers: sudo systemctl enable --now subcult-roundtable subcult-initiative',
    );
    console.log('  5. Verify heartbeat: check ops_action_runs for new rows');
    console.log('  6. Enable roundtable: set roundtable_policy.enabled = true');
    console.log('  7. Enable proactive triggers one by one');
    console.log('  8. Monitor /stage dashboard');
}

main().catch(err => {
    log.fatal('Verification failed', { error: err });
    process.exit(1);
});
