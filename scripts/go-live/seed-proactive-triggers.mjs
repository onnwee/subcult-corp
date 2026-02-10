// Seed proactive trigger rules into ops_trigger_rules
// These are additive — they don't delete existing reactive triggers.
// Run AFTER seed-trigger-rules.mjs
//
// Run: node scripts/go-live/seed-proactive-triggers.mjs

import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL);

// ─── Proactive triggers ───
// These fire on a cooldown schedule during heartbeat — no external event needed.
// Each one creates a proposal that the system can auto-approve into a mission.

const proactiveTriggers = [
    {
        name: 'Proactive signal scan',
        trigger_event: 'proactive_scan_signals',
        conditions: {
            topics: [
                'AI trends',
                'emerging tech',
                'startup ecosystem',
                'developer tools',
            ],
            skip_probability: 0.1,
            jitter_min_minutes: 25,
            jitter_max_minutes: 45,
        },
        action_config: { target_agent: 'chora' },
        cooldown_minutes: 180,
        enabled: false, // start disabled — enable when stable
    },
    {
        name: 'Proactive tweet drafting',
        trigger_event: 'proactive_draft_tweet',
        conditions: {
            topics: [
                'AI insights',
                'tech commentary',
                'productivity tips',
                'industry observations',
            ],
            skip_probability: 0.15,
            jitter_min_minutes: 25,
            jitter_max_minutes: 45,
        },
        action_config: { target_agent: 'chora' },
        cooldown_minutes: 240,
        enabled: false,
    },
    {
        name: 'Proactive deep research',
        trigger_event: 'proactive_research',
        conditions: {
            topics: [
                'multi-agent systems',
                'LLM optimization',
                'autonomous workflows',
                'knowledge management',
            ],
            skip_probability: 0.1,
            jitter_min_minutes: 30,
            jitter_max_minutes: 45,
        },
        action_config: { target_agent: 'chora' },
        cooldown_minutes: 360,
        enabled: false,
    },
    {
        name: 'Proactive ops analysis',
        trigger_event: 'proactive_analyze_ops',
        conditions: {
            skip_probability: 0.1,
            jitter_min_minutes: 25,
            jitter_max_minutes: 45,
        },
        action_config: { target_agent: 'subrosa' },
        cooldown_minutes: 480,
        enabled: false,
    },
    {
        name: 'Proactive content planning',
        trigger_event: 'proactive_content_plan',
        conditions: {
            topics: [
                'content calendar',
                'audience growth',
                'engagement strategy',
            ],
            skip_probability: 0.2,
            jitter_min_minutes: 30,
            jitter_max_minutes: 60,
        },
        action_config: { target_agent: 'praxis' },
        cooldown_minutes: 720,
        enabled: false,
    },
    {
        name: 'Proactive system health check',
        trigger_event: 'proactive_health_check',
        conditions: {
            skip_probability: 0.05,
            jitter_min_minutes: 10,
            jitter_max_minutes: 30,
        },
        action_config: { target_agent: 'subrosa' },
        cooldown_minutes: 360,
        enabled: false,
    },
    {
        name: 'Proactive memory consolidation',
        trigger_event: 'proactive_memory_consolidation',
        conditions: {
            skip_probability: 0.1,
            jitter_min_minutes: 20,
            jitter_max_minutes: 40,
        },
        action_config: { target_agent: 'chora' },
        cooldown_minutes: 720,
        enabled: false,
    },
];

async function seed() {
    console.log('Seeding proactive trigger rules...\n');

    let inserted = 0;
    let skipped = 0;

    for (const trigger of proactiveTriggers) {
        // Check if trigger with this name already exists
        const [existing] = await sql`
            SELECT id FROM ops_trigger_rules WHERE name = ${trigger.name}
        `;

        if (existing) {
            console.log(`  ⊘ ${trigger.name} (already exists, skipping)`);
            skipped++;
            continue;
        }

        try {
            await sql`
                INSERT INTO ops_trigger_rules (name, trigger_event, conditions, action_config, cooldown_minutes, enabled)
                VALUES (
                    ${trigger.name},
                    ${trigger.trigger_event},
                    ${JSON.stringify(trigger.conditions)}::jsonb,
                    ${JSON.stringify(trigger.action_config)}::jsonb,
                    ${trigger.cooldown_minutes},
                    ${trigger.enabled}
                )
            `;
            console.log(
                `  ✓ ${trigger.name} (cooldown: ${trigger.cooldown_minutes}m, enabled: ${trigger.enabled})`,
            );
            inserted++;
        } catch (err) {
            console.error(`  ✗ ${trigger.name}: ${err.message}`);
        }
    }

    console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} existing.`);
    console.log('Tip: Enable individually via ops_policy or SQL when ready.');
    await sql.end();
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
