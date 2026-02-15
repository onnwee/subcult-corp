// Build script for the unified worker — resolves @/ path aliases
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { createLogger } from '../lib/logger.mjs';

const log = createLogger({ service: 'worker-build' });
const srcDir = resolve(import.meta.dirname, '../../src');

await build({
    entryPoints: ['scripts/unified-worker/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node22',
    outfile: 'scripts/unified-worker/dist/index.js',
    sourcemap: true,
    external: ['postgres', '@openrouter/sdk', 'dotenv', 'zod', 'zod/v4'],
    alias: {
        '@': srcDir,
    },
});

log.info('Unified worker built successfully');
