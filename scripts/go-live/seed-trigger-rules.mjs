// Seed trigger rules into ops_trigger_rules
// Run: node scripts/go-live/seed-trigger-rules.mjs

import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL);

const triggers = [
    // ─── Reactive Triggers (Chora: Analysis) ───
    {
        name: 'Mission failure diagnosis (Chora)',
        trigger_event: 'mission_failed',
        conditions: { lookback_minutes: 60 },
        action_config: { target_agent: 'chora', action: 'diagnose' },
        cooldown_minutes: 120,
        enabled: true,
    },
    {
        name: 'Content published review (Chora)',
        trigger_event: 'content_published',
        conditions: { lookback_minutes: 60 },
        action_config: { target_agent: 'chora', action: 'analyze_reception' },
        cooldown_minutes: 120,
        enabled: true,
    },

    // ─── Subrosa: Risk Assessment ───
    {
        name: 'Public content risk check (Subrosa)',
        trigger_event: 'content_marked_public',
        conditions: { lookback_minutes: 5 },
        action_config: { target_agent: 'subrosa', action: 'risk_assessment' },
        cooldown_minutes: 60,
        enabled: true,
    },

    // ─── Thaum: Creative Disruption ───
    {
        name: 'Proactive signal scan (Thaum)',
        trigger_event: 'proactive_scan_signals',
        conditions: {
            topics: [
                'AI trends',
                'emerging tech',
                'startup ecosystem',
                'developer tools',
                'cultural shifts',
                'platform politics',
            ],
            skip_probability: 0.1,
            jitter_min_minutes: 25,
            jitter_max_minutes: 45,
        },
        action_config: { target_agent: 'thaum', action: 'surface_patterns' },
        cooldown_minutes: 180,
        enabled: true,
    },
    {
        name: 'Creativity unlock (Thaum)',
        trigger_event: 'work_stalled',
        conditions: { stall_minutes: 120 },
        action_config: {
            target_agent: 'thaum',
            action: 'propose_reframe',
        },
        cooldown_minutes: 240,
        enabled: true,
    },

    // ─── Praxis: Execution & Commitment ───
    {
        name: 'Auto-proposal acceptance (Praxis)',
        trigger_event: 'proposal_ready',
        conditions: { auto_approved: true },
        action_config: { target_agent: 'praxis', action: 'commit' },
        cooldown_minutes: 0,
        enabled: true,
    },
    {
        name: 'Milestone reached (Praxis)',
        trigger_event: 'mission_milestone_hit',
        conditions: { lookback_minutes: 30 },
        action_config: { target_agent: 'praxis', action: 'log_completion' },
        cooldown_minutes: 60,
        enabled: true,
    },

    // ─── Coordination ───
    {
        name: 'Roundtable convening (Mux dispatch)',
        trigger_event: 'daily_roundtable',
        conditions: {
            participants: ['chora', 'subrosa', 'thaum', 'praxis'],
            topic_source: 'recent_events',
        },
        action_config: { target_agent: 'mux', action: 'convene_roundtable' },
        cooldown_minutes: 1440,
        enabled: true,
    },
    {
        name: 'Memory consolidation (Chora)',
        trigger_event: 'memory_consolidation_due',
        conditions: { lookback_days: 1 },
        action_config: {
            target_agent: 'chora',
            action: 'distill_and_tag',
        },
        cooldown_minutes: 1440,
        enabled: true,
    },
];

async function seed() {
    console.log('Seeding ops_trigger_rules...');

    // Clear existing rules
    try {
        await sql`DELETE FROM ops_trigger_rules WHERE TRUE`;
    } catch (err) {
        console.error('  ✗ Failed to clear existing rules:', err.message);
    }

    for (const trigger of triggers) {
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
            console.log(`  ✓ ${trigger.name}`);
        } catch (err) {
            console.error(`  ✗ ${trigger.name}: ${err.message}`);
        }
    }

    console.log(`Done. Seeded ${triggers.length} trigger rules.`);
    await sql.end();
}

seed().catch(console.error);
