// Seed trigger rule for Thaum's monthly agent design review
// Run: node scripts/go-live/seed-agent-design-trigger.mjs

import postgres from 'postgres';
import dotenv from 'dotenv';
import { createLogger } from '../lib/logger.mjs';

dotenv.config({ path: ['.env.local', '.env'] });
const log = createLogger({ service: 'seed-agent-design-trigger' });

if (!process.env.DATABASE_URL) {
    log.fatal('Missing DATABASE_URL');
    process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL);

const trigger = {
    name: 'Monthly agent design review (Thaum)',
    trigger_event: 'agent_design_review',
    conditions: {
        schedule: 'monthly',
        day_of_month: 1,
        description:
            'Monthly review of collective composition — propose new agents if gaps identified',
        min_agents_before_proposing: 4,
        max_pending_proposals: 2,
    },
    action_config: {
        target_agent: 'thaum',
        action: 'agent_design_proposal',
        module: 'agent-designer',
        function: 'generateAgentProposal',
    },
    cooldown_minutes: 43200, // 30 days in minutes
    enabled: true,
};

async function seed() {
    log.info('Seeding agent design trigger rule');

    try {
        // Upsert — don't duplicate if already seeded
        await sql`
            INSERT INTO ops_trigger_rules (name, trigger_event, conditions, action_config, cooldown_minutes, enabled)
            VALUES (
                ${trigger.name},
                ${trigger.trigger_event},
                ${sql.json(trigger.conditions)},
                ${sql.json(trigger.action_config)},
                ${trigger.cooldown_minutes},
                ${trigger.enabled}
            )
            ON CONFLICT (name) DO UPDATE SET
                trigger_event = EXCLUDED.trigger_event,
                conditions = EXCLUDED.conditions,
                action_config = EXCLUDED.action_config,
                cooldown_minutes = EXCLUDED.cooldown_minutes,
                enabled = EXCLUDED.enabled
        `;
        log.info('Seeded trigger', { name: trigger.name });
    } catch (err) {
        // If ON CONFLICT (name) fails because name is not unique, fall back to insert
        if (err.code === '42P10' || err.code === '42703') {
            log.warn(
                'name column may not have a unique constraint — inserting directly',
            );
            await sql`
                INSERT INTO ops_trigger_rules (name, trigger_event, conditions, action_config, cooldown_minutes, enabled)
                VALUES (
                    ${trigger.name},
                    ${trigger.trigger_event},
                    ${sql.json(trigger.conditions)},
                    ${sql.json(trigger.action_config)},
                    ${trigger.cooldown_minutes},
                    ${trigger.enabled}
                )
            `;
            log.info('Seeded trigger (direct insert)', { name: trigger.name });
        } else {
            log.error('Seed failed', { name: trigger.name, error: err });
            throw err;
        }
    }

    log.info('Done');
    await sql.end();
}

seed().catch(err => {
    log.fatal('Seed failed', { error: err });
    process.exit(1);
});
