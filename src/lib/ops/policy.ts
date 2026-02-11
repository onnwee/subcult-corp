// Policy store with 30-second TTL cache
import { sql, jsonb } from '@/lib/db';

const CACHE_TTL_MS = 30_000;
const policyCache = new Map<
    string,
    { value: Record<string, unknown>; ts: number }
>();

export async function getPolicy(key: string): Promise<Record<string, unknown>> {
    const cached = policyCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.value;
    }

    const [row] = await sql<[{ value: Record<string, unknown> }?]>`
        SELECT value FROM ops_policy WHERE key = ${key}
    `;

    const value = row?.value ?? { enabled: false };
    policyCache.set(key, { value, ts: Date.now() });
    return value;
}

export async function setPolicy(
    key: string,
    value: Record<string, unknown>,
    description?: string,
): Promise<void> {
    await sql`
        INSERT INTO ops_policy (key, value, description, updated_at)
        VALUES (${key}, ${jsonb(value)}, ${description ?? null}, NOW())
        ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            description = COALESCE(EXCLUDED.description, ops_policy.description),
            updated_at = NOW()
    `;

    policyCache.delete(key);
}

export function clearPolicyCache(): void {
    policyCache.clear();
}
