/**
 * Request-scoped context using AsyncLocalStorage.
 * Allows the logger to automatically enrich logs with request_id,
 * HTTP method, and path without threading through every function call.
 *
 * Usage in middleware:
 *   requestContext.run({ requestId, method, path }, () => next());
 *
 * Usage in logger (automatic):
 *   const ctx = requestContext.get();
 *   if (ctx) entry.request_id = ctx.requestId;
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
    requestId: string;
    method?: string;
    path?: string;
}

class RequestContext {
    private storage = new AsyncLocalStorage<RequestContextData>();

    /**
     * Run a callback with request context attached.
     * All async operations within the callback will have access to this context.
     */
    run<T>(ctx: RequestContextData, fn: () => T): T {
        return this.storage.run(ctx, fn);
    }

    /** Get the current request context, or null if not in a request scope. */
    get(): RequestContextData | null {
        return this.storage.getStore() ?? null;
    }
}

/** Singleton request context instance. */
export const requestContext = new RequestContext();

/** Generate a short request ID (collision-safe for reasonable RPS). */
export function generateRequestId(): string {
    // 12 hex chars = 48 bits of entropy ≈ 281 trillion possible IDs
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
