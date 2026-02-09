// Seed trigger rules into ops_trigger_rules
// Run: node scripts/go-live/seed-trigger-rules.mjs

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
);

const triggers = [
    // ─── Reactive Triggers ───
    {
        name: 'Mission failure diagnosis',
        trigger_event: 'mission_failed',
        conditions: { lookback_minutes: 60 },
        action_config: { target_agent: 'brain' },
        cooldown_minutes: 120,
        enabled: true,
    },
    {
        name: 'Content published review',
        trigger_event: 'content_published',
        conditions: { lookback_minutes: 60 },
        action_config: { target_agent: 'observer' },
        cooldown_minutes: 120,
        enabled: true,
    },

    // ─── Proactive Triggers ───
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
        action_config: { target_agent: 'brain' },
        cooldown_minutes: 180, // every 3 hours
        enabled: true,
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
        action_config: { target_agent: 'brain' },
        cooldown_minutes: 240, // every 4 hours
        enabled: true,
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
        action_config: { target_agent: 'brain' },
        cooldown_minutes: 360, // every 6 hours
        enabled: true,
    },
    {
        name: 'Proactive ops analysis',
        trigger_event: 'proactive_analyze_ops',
        conditions: {
            skip_probability: 0.1,
            jitter_min_minutes: 25,
            jitter_max_minutes: 45,
        },
        action_config: { target_agent: 'observer' },
        cooldown_minutes: 480, // every 8 hours
        enabled: true,
    },
];

async function seed() {
    console.log('Seeding ops_trigger_rules...');

    // Clear existing rules
    const { error: deleteError } = await sb
        .from('ops_trigger_rules')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all

    if (deleteError) {
        console.error(
            '  ✗ Failed to clear existing rules:',
            deleteError.message,
        );
    }

    for (const trigger of triggers) {
        const { error } = await sb.from('ops_trigger_rules').insert(trigger);

        if (error) {
            console.error(`  ✗ ${trigger.name}: ${error.message}`);
        } else {
            console.log(`  ✓ ${trigger.name}`);
        }
    }

    console.log(`Done. Seeded ${triggers.length} trigger rules.`);
}

seed().catch(console.error);
