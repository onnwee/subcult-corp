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
    log.info(msg);
    passed++;
}

function fail(msg) {
    log.error(msg);
    failed++;
}

function warn(msg) {
    log.warn(msg);
    warnings++;
}

// ─── Checks ───

async function checkEnvVars() {
    log.info('Checking environment variables');

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
    log.info('Checking database tables');

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
    log.info('Checking policies');

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
    log.info('Checking trigger rules');

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
            log.debug('Reactive trigger', { name: t.name, enabled: t.enabled, fire_count: t.fire_count });
        }

        pass(`${proactive.length} proactive trigger(s)`);
        for (const t of proactive) {
            log.debug('Proactive trigger', { name: t.name, enabled: t.enabled, fire_count: t.fire_count });
        }
    } catch (err) {
        fail(`Failed to query trigger rules: ${err.message}`);
    }
}

async function checkRelationships(sql) {
    log.info('Checking agent relationships');

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
            log.debug('Agent relationship', {
                agents: `${r.agent_a} ↔ ${r.agent_b}`,
                affinity: r.affinity,
                interactions: r.total_interactions,
            });
        }
    } catch (err) {
        fail(`Failed to query relationships: ${err.message}`);
    }
}

async function checkRecentActivity(sql) {
    log.info('Checking recent activity');

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
    log.info('Checking LLM API connectivity');

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
    log.info('Starting launch verification');

    await checkEnvVars();

    if (!DATABASE_URL) {
        log.fatal('Cannot proceed without DATABASE_URL');
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
    log.info('Launch verification complete', { passed, warnings, failed });

    if (failed > 0) {
        log.error('Fix the failures before launching');
        process.exit(1);
    } else if (warnings > 0) {
        log.warn('System is functional but has warnings');
    } else {
        log.info('All checks passed — ready to launch!');
    }
}

main().catch(err => {
    log.fatal('Verification failed', { error: err });
    process.exit(1);
});
