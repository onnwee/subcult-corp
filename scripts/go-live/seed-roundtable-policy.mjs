// Seed roundtable policy — conversation schedule and controls for subcult agents
// Run: node scripts/go-live/seed-roundtable-policy.mjs
//
// Configures the roundtable conversation system for: Chora, Subrosa, Thaum, Praxis (+ Mux coordination)
// The roundtable system starts DISABLED. Enable once heartbeat + workers loop is healthy.

import postgres from 'postgres';
import dotenv from 'dotenv';
import { createLogger } from '../lib/logger.mjs';

dotenv.config({ path: ['.env.local', '.env'] });
const log = createLogger({ service: 'seed-roundtable-policy' });

if (!process.env.DATABASE_URL) {
    log.fatal('Missing DATABASE_URL');
    process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL);

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
    log.info('Seeding roundtable policies');

    for (const policy of roundtablePolicies) {
        try {
            await sql`
                INSERT INTO ops_policy (key, value, description)
                VALUES (${policy.key}, ${sql.json(policy.value)}, ${policy.description})
                ON CONFLICT (key) DO UPDATE SET
                    value = EXCLUDED.value,
                    description = EXCLUDED.description
            `;
            log.info('Seeded policy', { key: policy.key });
        } catch (err) {
            log.error('Seed failed', { key: policy.key, error: err });
        }
    }

    log.info('Done — roundtable policies seeded');
    log.info(
        'Next steps: verify heartbeat, run cycles, enable roundtable_policy',
    );
    await sql.end();
}

seed().catch(err => {
    log.fatal('Seed failed', { error: err });
    process.exit(1);
});
