// Seed trigger rule for automatic agent proposal voting
// Run: node scripts/go-live/seed-agent-proposal-voting-trigger.mjs

import postgres from 'postgres';
import dotenv from 'dotenv';
import { createLogger } from '../lib/logger.mjs';

dotenv.config({ path: ['.env.local', '.env'] });
const log = createLogger({ service: 'seed-agent-proposal-voting-trigger' });

if (!process.env.DATABASE_URL) {
    log.fatal('Missing DATABASE_URL');
    process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL);

const trigger = {
    name: 'Agent proposal voting trigger',
    trigger_event: 'agent_proposal_created',
    conditions: {
        lookback_minutes: 60,
        description:
            'Automatically transition new agent proposals to voting by creating a debate roundtable',
    },
    action_config: {
        target_agent: 'mux',
        action: 'start_agent_proposal_debate',
        module: 'triggers',
        function: 'checkAgentProposalCreated',
    },
    cooldown_minutes: 5,
    enabled: true,
};

async function seed() {
    log.info('Seeding agent proposal voting trigger rule');

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
        // Fallback for databases where ON CONFLICT (name) fails due to missing unique constraint
        // PostgreSQL error codes:
        //   42P10 = invalid_column_definition (returned when ON CONFLICT references non-unique column)
        //   42703 = undefined_column (column doesn't exist)
        // This allows the seed to work on databases without the unique constraint on name
        if (err.code === '42P10' || err.code === '42703') {
            log.warn(
                `ON CONFLICT failed with error code ${err.code} - falling back to direct insert without conflict handling`,
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
