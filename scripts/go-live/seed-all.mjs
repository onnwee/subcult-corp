#!/usr/bin/env node

// seed-all.mjs — Run all seed scripts in the correct order.
// Usage: node scripts/go-live/seed-all.mjs
//
// This is a convenience wrapper. You can also run each script individually.

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { createLogger } from '../lib/logger.mjs';

const log = createLogger({ service: 'seed-all' });

const SCRIPTS_DIR = new URL('./', import.meta.url).pathname;

const scripts = [
    {
        file: 'seed-agent-registry.mjs',
        desc: 'Agent registry (OpenClaw personalities)',
    },
    { file: 'seed-ops-policy.mjs', desc: 'Core policies' },
    {
        file: 'seed-trigger-rules.mjs',
        desc: 'Trigger rules (reactive + proactive)',
    },
    {
        file: 'seed-proactive-triggers.mjs',
        desc: 'Proactive triggers (disabled by default)',
    },
    { file: 'seed-roundtable-policy.mjs', desc: 'Roundtable policies' },
    { file: 'seed-relationships.mjs', desc: 'Agent relationships (10 pairs)' },
];

log.info('Starting seed-all');

let succeeded = 0;
let errors = 0;

for (const { file, desc } of scripts) {
    const path = `${SCRIPTS_DIR}${file}`;

    if (!existsSync(path)) {
        log.error('Script not found, skipping', { file });
        errors++;
        continue;
    }

    log.info('Running seed script', { file, desc });

    try {
        execSync(`node "${path}"`, {
            stdio: 'inherit',
            timeout: 30_000,
        });
        succeeded++;
    } catch {
        log.error('Seed script failed', { file });
        errors++;
    }
}

log.info('Seed-all completed', { succeeded, errors, total: scripts.length });

if (errors > 0) {
    process.exit(1);
}
