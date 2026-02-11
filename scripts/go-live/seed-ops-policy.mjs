// Seed core policies into ops_policy
// Run: node scripts/go-live/seed-ops-policy.mjs

import postgres from 'postgres';
import dotenv from 'dotenv';
import { createLogger } from '../lib/logger.mjs';

dotenv.config({ path: ['.env.local', '.env'] });
const log = createLogger({ service: 'seed-ops-policy' });

if (!process.env.DATABASE_URL) {
    log.fatal('Missing DATABASE_URL');
    process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL);

const policies = [
    {
        key: 'auto_approve',
        value: {
            enabled: true,
            allowed_step_kinds: [
                'analyze_discourse',
                'scan_signals',
                'research_topic',
                'distill_insight',
                'draft_thread',
                'critique_content',
                'review_policy',
                'log_event',
                'tag_memory',
                'classify_pattern',
            ],
        },
        description:
            'Which step kinds can be auto-approved without human review',
    },
    {
        key: 'x_daily_quota',
        value: { limit: 5 },
        description: 'Daily tweet/post limit (Subrosa approved)',
    },
    {
        key: 'content_policy',
        value: { enabled: true, max_drafts_per_day: 8 },
        description: 'Content creation controls',
    },
    {
        key: 'initiative_policy',
        value: { enabled: false },
        description:
            'Agent initiative system (Thaum generates ideas; keep off until stable)',
    },
    {
        key: 'memory_influence_policy',
        value: { enabled: true, probability: 0.3 },
        description: 'Probability that agent memory influences next proposal',
    },
    {
        key: 'relationship_drift_policy',
        value: { enabled: true, max_drift: 0.03 },
        description: 'Max relationship drift per conversation',
    },
    {
        key: 'roundtable_policy',
        value: {
            enabled: true,
            max_daily_conversations: 3,
            participants: ['chora', 'subrosa', 'thaum', 'praxis'],
        },
        description: 'Roundtable conversation system (OpenClaw personalities)',
    },
    {
        key: 'system_enabled',
        value: { enabled: true },
        description: 'Global system kill switch',
    },
    {
        key: 'reaction_matrix',
        value: {
            patterns: [
                {
                    source: '*',
                    tags: ['mission', 'failed'],
                    target: 'chora',
                    type: 'diagnose',
                    probability: 1.0,
                    cooldown: 60,
                },
                {
                    source: 'praxis',
                    tags: ['content', 'published'],
                    target: 'chora',
                    type: 'review',
                    probability: 0.5,
                    cooldown: 120,
                },
                {
                    source: 'praxis',
                    tags: ['post', 'shipped'],
                    target: 'chora',
                    type: 'analyze_response',
                    probability: 0.3,
                    cooldown: 120,
                },
                {
                    source: 'chora',
                    tags: ['insight', 'discovered'],
                    target: 'praxis',
                    type: 'propose_action',
                    probability: 0.4,
                    cooldown: 60,
                },
                {
                    source: 'subrosa',
                    tags: ['risk', 'identified'],
                    target: 'chora',
                    type: 'root_cause_analysis',
                    probability: 0.8,
                    cooldown: 180,
                },
                {
                    source: 'thaum',
                    tags: ['pattern', 'stalled'],
                    target: 'chora',
                    type: 'reframe_with_context',
                    probability: 0.6,
                    cooldown: 120,
                },
            ],
        },
        description:
            'Agent-to-agent reaction patterns based on OpenClaw coordination model',
    },
    {
        key: 'subcult_step_kinds',
        value: {
            analysis: [
                'analyze_discourse',
                'scan_signals',
                'research_topic',
                'classify_pattern',
                'trace_incentive',
                'identify_assumption',
            ],
            content: [
                'draft_thread',
                'draft_essay',
                'critique_content',
                'refine_narrative',
                'prepare_statement',
                'write_issue',
            ],
            operations: [
                'audit_system',
                'review_policy',
                'distill_insight',
                'consolidate_memory',
                'map_dependency',
                'patch_code',
                'document_lesson',
            ],
            coordination: [
                'log_event',
                'tag_memory',
                'escalate_risk',
                'convene_roundtable',
                'propose_workflow',
            ],
        },
        description:
            'Subcult-specific step kinds organized by function (not generic labels)',
    },
    {
        key: 'memory_tags',
        value: {
            categories: [
                'insight',
                'pattern',
                'strategy',
                'preference',
                'lesson',
            ],
            subcult_tags: [
                'platform-capture',
                'extraction-risk',
                'cultural-praxis',
                'system-incentive',
                'coordination-friction',
                'autonomy-threat',
            ],
        },
        description: 'Memory categorization and Subcult-specific semantic tags',
    },
];

async function seed() {
    log.info('Seeding ops_policy');

    for (const policy of policies) {
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

    log.info('Done');
    await sql.end();
}

seed().catch(err => log.fatal('Seed failed', { error: err }));
