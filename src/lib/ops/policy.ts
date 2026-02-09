// Policy helper — read from ops_policy table
import type { SupabaseClient } from '@supabase/supabase-js';

// In-memory cache with TTL (avoid hammering the DB)
const policyCache = new Map<
    string,
    { value: Record<string, unknown>; expiresAt: number }
>();
const CACHE_TTL_MS = 30_000; // 30 seconds

export async function getPolicy(
    sb: SupabaseClient,
    key: string,
): Promise<Record<string, unknown>> {
    // Check cache
    const cached = policyCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.value;
    }

    const { data, error } = await sb
        .from('ops_policy')
        .select('value')
        .eq('key', key)
        .maybeSingle();

    if (error) {
        console.error(
            `[policy] Failed to read policy "${key}":`,
            error.message,
        );
        return {};
    }

    const value = (data?.value as Record<string, unknown>) ?? {};
    policyCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
}

export async function setPolicy(
    sb: SupabaseClient,
    key: string,
    value: Record<string, unknown>,
): Promise<void> {
    const { error } = await sb
        .from('ops_policy')
        .upsert({ key, value, updated_at: new Date().toISOString() });

    if (error) {
        throw new Error(`Failed to set policy "${key}": ${error.message}`);
    }

    // Invalidate cache
    policyCache.delete(key);
}

export function clearPolicyCache(): void {
    policyCache.clear();
}
