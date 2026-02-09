#!/usr/bin/env node

// seed-all.mjs — Run all seed scripts in the correct order.
// Usage: node scripts/go-live/seed-all.mjs
//
// This is a convenience wrapper. You can also run each script individually.

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const SCRIPTS_DIR = new URL('./', import.meta.url).pathname;

const scripts = [
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
    { file: 'seed-relationships.mjs', desc: 'Agent relationships (3 pairs)' },
];

console.log('╔══════════════════════════════════════╗');
console.log('║     SUBCULT OPS — Seed All Data      ║');
console.log('╚══════════════════════════════════════╝\n');

let succeeded = 0;
let errors = 0;

for (const { file, desc } of scripts) {
    const path = `${SCRIPTS_DIR}${file}`;

    if (!existsSync(path)) {
        console.error(`\n✗ ${file} not found — skipping`);
        errors++;
        continue;
    }

    console.log(`\n── ${desc} ──`);
    console.log(`   Running: ${file}`);

    try {
        execSync(`node "${path}"`, {
            stdio: 'inherit',
            timeout: 30_000,
        });
        succeeded++;
    } catch {
        console.error(`\n✗ ${file} failed`);
        errors++;
    }
}

console.log('\n══════════════════════════════════════');
console.log(`  Seeds completed: ${succeeded}/${scripts.length}`);
if (errors > 0) console.log(`  Errors: ${errors}`);
console.log('══════════════════════════════════════');
console.log('\nNext step: node scripts/go-live/verify-launch.mjs');
