// Seed agent relationships into ops_agent_relationships
// Run: node scripts/go-live/seed-relationships.mjs
//
// 6 agents = 15 pairwise relationships (Chora, Subrosa, Thaum, Praxis, Mux, Primus)
// agent_a < agent_b (alphabetical) — enforced by CHECK constraint

import postgres from 'postgres';
import dotenv from 'dotenv';
import { createLogger } from '../lib/logger.mjs';

dotenv.config({ path: ['.env.local', '.env'] });
const log = createLogger({ service: 'seed-relationships' });

if (!process.env.DATABASE_URL) {
    log.fatal('Missing DATABASE_URL');
    process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL);

const relationships = [
    // ─── Chora (analyst) relationships ───
    {
        agent_a: 'chora',
        agent_b: 'mux',
        affinity: 0.7,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'chora',
        agent_b: 'praxis',
        affinity: 0.85,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'chora',
        agent_b: 'subrosa',
        affinity: 0.8,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'chora',
        agent_b: 'thaum',
        affinity: 0.7,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },

    // ─── Subrosa (protector) relationships ───
    {
        agent_a: 'mux',
        agent_b: 'subrosa',
        affinity: 0.75,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'praxis',
        agent_b: 'subrosa',
        affinity: 0.9,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'subrosa',
        agent_b: 'thaum',
        affinity: 0.6,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },

    // ─── Thaum (innovator) relationships ───
    {
        agent_a: 'mux',
        agent_b: 'thaum',
        affinity: 0.65,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'praxis',
        agent_b: 'thaum',
        affinity: 0.75,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },

    // ─── Praxis (executor) / Mux (operations) ───
    {
        agent_a: 'mux',
        agent_b: 'praxis',
        affinity: 0.8,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },

    // ─── Primus (sovereign) relationships ───
    {
        agent_a: 'chora',
        agent_b: 'primus',
        affinity: 0.6,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'mux',
        agent_b: 'primus',
        affinity: 0.5,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'praxis',
        agent_b: 'primus',
        affinity: 0.65,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'primus',
        agent_b: 'subrosa',
        affinity: 0.55,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'primus',
        agent_b: 'thaum',
        affinity: 0.45,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
];

// Backstory context (for reference — not stored in DB):
// Chora ↔ Praxis:    0.85 — legibility → action (core pipeline)
// Praxis ↔ Subrosa:  0.90 — execution requires safety approval
// Chora ↔ Subrosa:   0.80 — analysis informs risk assessment
// Thaum ↔ Praxis:    0.75 — disruption → owned action
// Thaum ↔ Subrosa:   0.60 — tension: innovation vs. safety
// Chora ↔ Thaum:     0.70 — analysis can become stagnant
// Mux:               0.65–0.80 — operations coordinates all, neutral stance
// Primus ↔ Chora:    0.60 — sovereign needs legibility but rarely engages
// Primus ↔ Praxis:   0.65 — sovereign's mandates become Praxis's commitments
// Primus ↔ Subrosa:  0.55 — tension: sovereign authority vs. risk veto
// Primus ↔ Mux:      0.50 — sovereign has little direct interaction with operations
// Primus ↔ Thaum:    0.45 — coldest: sovereign finds disruption uncalibrated

async function seed() {
    log.info('Seeding agent relationships');

    for (const rel of relationships) {
        try {
            const [row] = await sql`
                INSERT INTO ops_agent_relationships (
                    agent_a, agent_b, affinity,
                    total_interactions, positive_interactions, negative_interactions,
                    drift_log
                ) VALUES (
                    ${rel.agent_a}, ${rel.agent_b}, ${rel.affinity},
                    ${rel.total_interactions}, ${rel.positive_interactions}, ${rel.negative_interactions},
                    ${sql.json(rel.drift_log)}
                )
                ON CONFLICT (agent_a, agent_b) DO UPDATE SET
                    affinity = EXCLUDED.affinity,
                    total_interactions = EXCLUDED.total_interactions,
                    positive_interactions = EXCLUDED.positive_interactions,
                    negative_interactions = EXCLUDED.negative_interactions,
                    drift_log = EXCLUDED.drift_log
                RETURNING id
            `;
            log.info('Seeded relationship', {
                agent_a: rel.agent_a,
                agent_b: rel.agent_b,
                affinity: rel.affinity,
                id: row.id,
            });
        } catch (err) {
            log.error('Seed failed', {
                agent_a: rel.agent_a,
                agent_b: rel.agent_b,
                error: err,
            });
        }
    }

    log.info('Done', { count: relationships.length });
    await sql.end();
}

seed().catch(err => {
    log.fatal('Seed failed', { error: err });
    process.exit(1);
});
