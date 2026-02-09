// Seed roundtable policy — conversation schedule and controls
// Run: node scripts/go-live/seed-roundtable-policy.mjs
//
// This seeds/updates the roundtable_policy in ops_policy
// with conservative defaults. The roundtable system starts DISABLED.
// Enable it once the heartbeat + workers loop is healthy.

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
);

const roundtablePolicies = [
    // ─── Main roundtable toggle ───
    {
        key: 'roundtable_policy',
        value: {
            enabled: false, // START DISABLED — enable when system is stable
            max_daily_conversations: 5,
            min_conversation_gap_minutes: 60,
        },
        description:
            'Roundtable conversation system controls. Enable once heartbeat is healthy.',
    },

    // ─── Conversation format weights ───
    {
        key: 'roundtable_format_weights',
        value: {
            standup: 1.0,
            debate: 0.7,
            watercooler: 0.5,
        },
        description:
            'Probability multipliers per format. 1.0 = full schedule probability, 0.0 = never.',
    },

    // ─── Memory distillation controls ───
    {
        key: 'roundtable_distillation',
        value: {
            enabled: true,
            max_memories_per_conversation: 6,
            max_action_items_per_conversation: 3,
            min_confidence_threshold: 0.4,
        },
        description:
            'Controls for post-conversation memory extraction and action item generation.',
    },

    // ─── Voice evolution controls ───
    {
        key: 'voice_evolution_policy',
        value: {
            enabled: true,
            max_modifiers_per_agent: 3,
            cache_ttl_minutes: 10,
        },
        description:
            'Voice evolution system — modifies agent personality based on accumulated memories.',
    },
];

async function seed() {
    console.log('Seeding roundtable policies...\n');

    for (const policy of roundtablePolicies) {
        const { error } = await sb
            .from('ops_policy')
            .upsert(policy, { onConflict: 'key' });

        if (error) {
            console.error(`  ✗ ${policy.key}: ${error.message}`);
        } else {
            console.log(`  ✓ ${policy.key}`);
        }
    }

    console.log('\nDone. Roundtable policies seeded.');
    console.log(
        '\nNext steps:',
        '\n  1. Verify heartbeat is running (check ops_action_runs)',
        '\n  2. Run a few heartbeat cycles',
        '\n  3. Set roundtable_policy.enabled = true when ready',
    );
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
