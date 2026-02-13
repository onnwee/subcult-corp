/**
 * Next.js middleware — attaches request correlation IDs.
 *
 * For each incoming request:
 * 1. Reads x-request-id header (if exists) or generates a new one
 * 2. Sets x-request-id on the response
 * 3. Wraps the request in AsyncLocalStorage context so the logger
 *    can automatically enrich all logs with the request ID
 *
 * Only applies to API routes (/api/*) to avoid overhead on static assets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requestContext, generateRequestId } from '@/lib/request-context';

export function middleware(request: NextRequest) {
    const requestId =
        request.headers.get('x-request-id') ?? generateRequestId();

    // We cannot use AsyncLocalStorage.run() in Edge middleware directly,
    // but we CAN pass the request ID via headers so the API route handler
    // can pick it up and establish the context.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-request-id', requestId);

    const response = NextResponse.next({
        request: { headers: requestHeaders },
    });

    response.headers.set('x-request-id', requestId);

    return response;
}

export const config = {
    // Only run on API routes — skip static assets, images, etc.
    matcher: '/api/:path*',
};

/**
 * Helper for API route handlers to establish request context.
 * Call at the top of your route handler:
 *
 *   export async function GET(req: NextRequest) {
 *       return withRequestContext(req, async () => {
 *           // ... your handler logic
 *       });
 *   }
 *
 * This enables automatic request_id enrichment in all logs.
 */
export function withRequestContext<T>(
    req: NextRequest,
    handler: () => T | Promise<T>,
): T | Promise<T> {
    const requestId = req.headers.get('x-request-id') ?? generateRequestId();
    const method = req.method;
    const path = new URL(req.url).pathname;

    return requestContext.run({ requestId, method, path }, handler);
}
