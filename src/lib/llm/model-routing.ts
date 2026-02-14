// Dynamic model routing — resolve model list per tracking context
// Cascading lookup: exact context → prefix (before ':') → 'default' → hardcoded fallback
import { sql } from '@/lib/db';

/**
 * Default models for SDK-native routing via `models` array.
 * OpenRouter tries each in order, falling back on provider errors / unavailability.
 * Ordered by speed/cost — fast cheap models first, heavier last resort.
 *
 * Heavy models (opus-4.6, gpt-5.2, deepseek-r1) excluded from default rotation
 * — available via LLM_MODEL env override for specific tasks.
 */
export const DEFAULT_MODELS = [
    'anthropic/claude-haiku-4.5',
    'google/gemini-2.5-flash',
    'openai/gpt-4.1-mini',
    'deepseek/deepseek-v3.2',
    'qwen/qwen3-235b-a22b',
    'moonshotai/kimi-k2.5',
    'anthropic/claude-sonnet-4.5',  // last resort — higher quality, higher cost
];

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { models: string[]; ts: number }>();

/**
 * Resolve the ordered model list for a given tracking context.
 * Cascading lookup: exact match → prefix before ':' → 'default' row → hardcoded DEFAULT_MODELS.
 */
export async function resolveModels(context?: string): Promise<string[]> {
    if (!context) {
        return await lookupOrDefault('default');
    }

    // 1. Exact match
    const exact = await lookupCached(context);
    if (exact) return exact;

    // 2. Prefix match (e.g. 'roundtable:deep_dive' → 'roundtable')
    const colonIdx = context.indexOf(':');
    if (colonIdx > 0) {
        const prefix = context.slice(0, colonIdx);
        const prefixResult = await lookupCached(prefix);
        if (prefixResult) return prefixResult;
    }

    // 3. Default row
    return await lookupOrDefault('default');
}

/** Lookup with 30s TTL cache. Returns null if no row found or if models array is empty. */
async function lookupCached(context: string): Promise<string[] | null> {
    const cached = cache.get(context);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.models.length > 0 ? cached.models : null;
    }

    try {
        const [row] = await sql<[{ models: string[] }?]>`
            SELECT models FROM ops_model_routing WHERE context = ${context}
        `;

        if (!row || !row.models || row.models.length === 0) {
            // Cache the miss too, so we don't hit the DB every call
            // Treat NULL or empty array as a miss to fall back to prefix/default/hardcoded
            cache.set(context, { models: [], ts: Date.now() });
            return null;
        }

        cache.set(context, { models: row.models, ts: Date.now() });
        return row.models;
    } catch (error) {
        // If the routing table is missing or the query fails for any reason,
        // log and fall back to hardcoded DEFAULT_MODELS via lookupOrDefault.
        console.error(
            'resolveModels: failed to query ops_model_routing; falling back to default models',
            error,
        );
        // Cache the miss so we don't repeatedly hit a failing query.
        cache.set(context, { models: [], ts: Date.now() });
        return null;
    }
}

/** Lookup 'default' row, fall back to hardcoded DEFAULT_MODELS. */
async function lookupOrDefault(context: string): Promise<string[]> {
    const result = await lookupCached(context);
    return result ?? DEFAULT_MODELS;
}
