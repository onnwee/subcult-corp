// Seed agent relationships into ops_agent_relationships
// Run: node scripts/go-live/seed-relationships.mjs
//
// 3 agents = 3 pairwise relationships
// agent_a < agent_b (alphabetical) — enforced by CHECK constraint

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
);

const relationships = [
    {
        agent_a: 'brain', // alphabetical: brain < opus
        agent_b: 'opus',
        affinity: 0.8,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'brain', // alphabetical: brain < observer
        agent_b: 'observer',
        affinity: 0.8,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'observer', // alphabetical: observer < opus
        agent_b: 'opus',
        affinity: 0.5,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
];

// Backstory context (for reference — not stored in DB):
// brain ↔ opus:     0.80 — most trusted advisor, tight coordination
// brain ↔ observer: 0.80 — research partners, closest allies
// observer ↔ opus:  0.50 — neutral, coordinator vs. monitor dynamic

async function seed() {
    console.log('Seeding agent relationships...\n');

    for (const rel of relationships) {
        const { data, error } = await sb
            .from('ops_agent_relationships')
            .upsert(rel, { onConflict: 'agent_a,agent_b' })
            .select('id')
            .single();

        if (error) {
            console.error(
                `  ✗ ${rel.agent_a} ↔ ${rel.agent_b}: ${error.message}`,
            );
        } else {
            console.log(
                `  ✓ ${rel.agent_a} ↔ ${rel.agent_b}: affinity ${rel.affinity} (${data.id})`,
            );
        }
    }

    console.log('\nDone! Seeded', relationships.length, 'relationships.');
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
