/**
 * Client-side logger for browser/React components.
 * 
 * Unlike the server-side logger (which uses structured JSON in production),
 * client-side logging in the browser should remain human-readable for
 * developer console debugging. This wrapper provides a consistent API
 * while delegating to browser console methods.
 * 
 * Usage in 'use client' components:
 *   import { clientLogger } from '@/lib/client-logger';
 *   const log = clientLogger.child({ component: 'MyComponent' });
 *   log.error('Failed to fetch data', { error });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Record<string, unknown>;

export interface ClientLogger {
    debug(msg: string, ctx?: LogContext): void;
    info(msg: string, ctx?: LogContext): void;
    warn(msg: string, ctx?: LogContext): void;
    error(msg: string, ctx?: LogContext): void;
    child(bindings: LogContext): ClientLogger;
}

function formatMessage(
    msg: string,
    bindings: LogContext,
    ctx?: LogContext,
): [string, ...unknown[]] {
    const parts: unknown[] = [];
    const allContext = { ...bindings, ...ctx };
    
    if (Object.keys(allContext).length > 0) {
        parts.push(allContext);
    }
    
    return [msg, ...parts];
}

function createClientLoggerInternal(bindings: LogContext = {}): ClientLogger {
    return {
        debug: (msg, ctx) => {
            // eslint-disable-next-line no-console
            console.debug(...formatMessage(msg, bindings, ctx));
        },
        info: (msg, ctx) => {
            // eslint-disable-next-line no-console
            console.info(...formatMessage(msg, bindings, ctx));
        },
        warn: (msg, ctx) => {
            // eslint-disable-next-line no-console
            console.warn(...formatMessage(msg, bindings, ctx));
        },
        error: (msg, ctx) => {
            // eslint-disable-next-line no-console
            console.error(...formatMessage(msg, bindings, ctx));
        },
        child: (childBindings) =>
            createClientLoggerInternal({ ...bindings, ...childBindings }),
    };
}

/** Root client logger instance. Use clientLogger.child({ component: 'xxx' }) to scope. */
export const clientLogger = createClientLoggerInternal();
