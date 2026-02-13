// Build script for the unified worker — resolves @/ path aliases
import { build } from 'esbuild';
import { resolve } from 'node:path';

const srcDir = resolve(import.meta.dirname, '../../src');

await build({
    entryPoints: ['scripts/unified-worker/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node22',
    outfile: 'scripts/unified-worker/dist/index.js',
    sourcemap: true,
    external: ['postgres', '@openrouter/sdk', 'dotenv'],
    alias: {
        '@': srcDir,
    },
});

console.log('Unified worker built successfully');
