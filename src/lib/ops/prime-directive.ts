// Prime Directive loader — reads the current directive from the workspace
import { execInToolbox } from '@/lib/tools/executor';

const DIRECTIVE_PATH = '/workspace/shared/prime-directive.md';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedDirective: string | null = null;
let cacheTime = 0;

/**
 * Load the prime directive from /workspace/shared/prime-directive.md.
 * Cached for 5 minutes to avoid hitting Docker exec on every session/turn.
 * Returns empty string if the file doesn't exist or can't be read.
 */
export async function loadPrimeDirective(): Promise<string> {
    if (cachedDirective !== null && Date.now() - cacheTime < CACHE_TTL_MS) {
        return cachedDirective;
    }

    const result = await execInToolbox(`cat '${DIRECTIVE_PATH}' 2>/dev/null || echo ''`, 5_000);

    if (result.exitCode === 0 && result.stdout.trim()) {
        cachedDirective = result.stdout.trim();
    } else {
        cachedDirective = '';
    }
    cacheTime = Date.now();

    return cachedDirective;
}
