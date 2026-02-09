// Seed core policies into ops_policy
// Run: node scripts/go-live/seed-ops-policy.mjs

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
);

const policies = [
    {
        key: 'auto_approve',
        value: {
            enabled: true,
            allowed_step_kinds: [
                'draft_tweet',
                'crawl',
                'analyze',
                'write_content',
                'research',
                'scan_signals',
                'summarize',
                'review',
            ],
        },
        description: 'Which step kinds can be auto-approved',
    },
    {
        key: 'x_daily_quota',
        value: { limit: 5 },
        description: 'Daily tweet posting limit',
    },
    {
        key: 'content_policy',
        value: { enabled: true, max_drafts_per_day: 8 },
        description: 'Content creation controls',
    },
    {
        key: 'initiative_policy',
        value: { enabled: false },
        description: 'Agent initiative system (keep off until stable)',
    },
    {
        key: 'memory_influence_policy',
        value: { enabled: true, probability: 0.3 },
        description: 'Memory influence probability',
    },
    {
        key: 'relationship_drift_policy',
        value: { enabled: true, max_drift: 0.03 },
        description: 'Max relationship drift per conversation',
    },
    {
        key: 'roundtable_policy',
        value: { enabled: false, max_daily_conversations: 5 },
        description: 'Conversation system controls',
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
                    target: 'brain',
                    type: 'diagnose',
                    probability: 1.0,
                    cooldown: 60,
                },
                {
                    source: 'brain',
                    tags: ['content', 'published'],
                    target: 'observer',
                    type: 'review',
                    probability: 0.5,
                    cooldown: 120,
                },
                {
                    source: 'brain',
                    tags: ['tweet', 'posted'],
                    target: 'observer',
                    type: 'analyze',
                    probability: 0.3,
                    cooldown: 120,
                },
                {
                    source: 'observer',
                    tags: ['insight', 'discovered'],
                    target: 'opus',
                    type: 'review',
                    probability: 0.4,
                    cooldown: 60,
                },
            ],
        },
        description: 'Agent-to-agent reaction patterns',
    },
];

async function seed() {
    console.log('Seeding ops_policy...');

    for (const policy of policies) {
        const { error } = await sb
            .from('ops_policy')
            .upsert(policy, { onConflict: 'key' });

        if (error) {
            console.error(`  ✗ ${policy.key}: ${error.message}`);
        } else {
            console.log(`  ✓ ${policy.key}`);
        }
    }

    console.log('Done.');
}

seed().catch(console.error);
