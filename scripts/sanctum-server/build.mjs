// Build script for the sanctum server — resolves @/ path aliases
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { createLogger } from '../lib/logger.mjs';

const log = createLogger({ service: 'sanctum-build' });
const srcDir = resolve(import.meta.dirname, '../../src');

await build({
    entryPoints: ['scripts/sanctum-server/server.mjs'],
    bundle: true,
    platform: 'node',
    target: 'node22',
    outfile: 'scripts/sanctum-server/dist/server.js',
    sourcemap: true,
    external: ['postgres', '@openrouter/sdk', 'dotenv', 'zod', 'zod/v4'],
    alias: {
        '@': srcDir,
    },
});

log.info('Sanctum server built successfully');
