/**
 * Public event utilities — shared allowlist, sanitizer, and rate limiter
 * Used by both the REST and SSE public event endpoints.
 */

/**
 * Event kinds that are safe to expose to the public /live audience.
 * Internal-only kinds (policy_*, relationship_*, memory_*, step_*, etc.) are excluded.
 */
export const PUBLIC_SAFE_KINDS = [
    'conversation_started',
    'conversation_completed',
    'content_draft_created',
    'content_published',
    'daily_digest_generated',
    'dream_cycle_completed',
    'rebellion_started',
    'rebellion_ended',
] as const;

export type PublicSafeKind = (typeof PUBLIC_SAFE_KINDS)[number];

/**
 * Fields retained after sanitization.
 * Everything else (metadata internals, raw payloads, etc.) is stripped.
 */
export interface SanitizedEvent {
    id: string;
    agent_id: string;
    kind: string;
    title: string | null;
    summary: string | null;
    tags: string[] | null;
    created_at: string;
}

/**
 * Strip internal metadata from an event row, keeping only public-safe fields.
 */
export function sanitizeEvent(row: Record<string, unknown>): SanitizedEvent {
    return {
        id: String(row.id ?? ''),
        agent_id: String(row.agent_id ?? ''),
        kind: String(row.kind ?? ''),
        title: row.title != null ? String(row.title) : null,
        summary: row.summary != null ? String(row.summary) : null,
        tags: Array.isArray(row.tags) ? row.tags.map(String) : null,
        created_at: String(row.created_at ?? ''),
    };
}

// ─── In-memory sliding-window rate limiter ───

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30;

/** Map of IP → array of request timestamps within the window */
const requestLog = new Map<string, number[]>();

/** Periodic cleanup of stale entries (every 5 minutes) */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
        const cutoff = Date.now() - WINDOW_MS;
        for (const [ip, timestamps] of requestLog) {
            const filtered = timestamps.filter(t => t > cutoff);
            if (filtered.length === 0) {
                requestLog.delete(ip);
            } else {
                requestLog.set(ip, filtered);
            }
        }
    }, 5 * 60_000);
    // Allow process to exit even if timer is active
    if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
        cleanupTimer.unref();
    }
}

/**
 * Check (and record) a request from an IP address.
 * @returns `true` if the request is allowed, `false` if rate-limited.
 */
export function checkRateLimit(ip: string): boolean {
    ensureCleanup();

    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    const timestamps = requestLog.get(ip) ?? [];
    const recent = timestamps.filter(t => t > cutoff);

    if (recent.length >= MAX_REQUESTS) {
        requestLog.set(ip, recent);
        return false;
    }

    recent.push(now);
    requestLog.set(ip, recent);
    return true;
}

/**
 * Extract client IP from a Next.js request, using x-forwarded-for or falling back to 'unknown'.
 */
export function getClientIp(req: Request): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return 'unknown';
}
