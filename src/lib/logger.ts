/**
 * Structured logger — zero-dependency, JSON in production, pretty in dev.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   const log = logger.child({ module: 'heartbeat' });
 *   log.info('Heartbeat fired', { duration_ms: 42 });
 *   log.error('Trigger evaluation failed', { error: err });
 */

import { requestContext } from './request-context';

// ── Log levels ──────────────────────────────────────────────
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVEL_VALUES: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    fatal: 50,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
    debug: '\x1b[90m', // gray
    info: '\x1b[36m', // cyan
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
    fatal: '\x1b[35m', // magenta
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

// ── Configuration ───────────────────────────────────────────
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_LEVEL = (process.env.LOG_LEVEL ??
    (IS_PRODUCTION ? 'info' : 'debug')) as LogLevel;
const MIN_LEVEL = LEVEL_VALUES[LOG_LEVEL] ?? LEVEL_VALUES.info;

// ── Types ───────────────────────────────────────────────────
export type LogContext = Record<string, unknown>;

export interface Logger {
    debug(msg: string, ctx?: LogContext): void;
    info(msg: string, ctx?: LogContext): void;
    warn(msg: string, ctx?: LogContext): void;
    error(msg: string, ctx?: LogContext): void;
    fatal(msg: string, ctx?: LogContext): void;
    child(bindings: LogContext): Logger;
}

// ── Serialization helpers ───────────────────────────────────

function serializeError(err: unknown): Record<string, unknown> {
    if (err instanceof Error) {
        return {
            message: err.message,
            name: err.name,
            ...(err.stack ? { stack: err.stack } : {}),
            ...(err.cause ? { cause: serializeError(err.cause) } : {}),
        };
    }
    return { message: String(err) };
}

function normalizeContext(ctx?: LogContext): LogContext | undefined {
    if (!ctx) return undefined;

    const normalized: LogContext = {};
    for (const [key, value] of Object.entries(ctx)) {
        if (key === 'error' || key === 'err') {
            normalized.error = serializeError(value);
        } else {
            normalized[key] = value;
        }
    }
    return normalized;
}

// ── JSON output (production) ────────────────────────────────

function writeJson(
    level: LogLevel,
    msg: string,
    bindings: LogContext,
    ctx?: LogContext,
): void {
    const entry: Record<string, unknown> = {
        level,
        time: new Date().toISOString(),
        msg,
        ...bindings,
        ...(ctx ?? {}),
    };

    // Inject request context if available
    const reqCtx = requestContext.get();
    if (reqCtx) {
        entry.request_id = reqCtx.requestId;
        if (reqCtx.method) entry.http_method = reqCtx.method;
        if (reqCtx.path) entry.http_path = reqCtx.path;
    }

    // Use stderr so stdout remains clean for structured output consumers
    process.stderr.write(JSON.stringify(entry) + '\n');
}

// ── Pretty output (development) ─────────────────────────────

function writePretty(
    level: LogLevel,
    msg: string,
    bindings: LogContext,
    ctx?: LogContext,
): void {
    const color = LEVEL_COLORS[level];
    const time = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
    const tag = level.toUpperCase().padEnd(5);

    // Merge bindings context for display
    const bindingStr =
        Object.keys(bindings).length > 0 ?
            ` ${DIM}${formatBindings(bindings)}${RESET}`
        :   '';

    let line = `${DIM}${time}${RESET} ${color}${tag}${RESET}${bindingStr} ${msg}`;

    // Append extra context
    if (ctx && Object.keys(ctx).length > 0) {
        const ctxStr = formatContext(ctx);
        if (ctxStr) {
            line += ` ${DIM}${ctxStr}${RESET}`;
        }
    }

    // Inject request ID if available
    const reqCtx = requestContext.get();
    if (reqCtx) {
        line += ` ${DIM}[${reqCtx.requestId.slice(0, 8)}]${RESET}`;
    }

    process.stderr.write(line + '\n');
}

function formatBindings(bindings: LogContext): string {
    return Object.entries(bindings)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(' ');
}

function formatContext(ctx: LogContext): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(ctx)) {
        if (key === 'error' && typeof value === 'object' && value !== null) {
            const err = value as Record<string, unknown>;
            parts.push(`error=${err.message ?? String(value)}`);
            if (err.stack && typeof err.stack === 'string') {
                // Only show first line of stack
                const firstFrame = err.stack.split('\n')[1]?.trim();
                if (firstFrame) parts.push(`  at ${firstFrame}`);
            }
        } else if (typeof value === 'object' && value !== null) {
            try {
                parts.push(`${key}=${JSON.stringify(value)}`);
            } catch {
                parts.push(`${key}=[circular]`);
            }
        } else {
            parts.push(`${key}=${String(value)}`);
        }
    }
    return parts.join(' ');
}

// ── Logger factory ──────────────────────────────────────────

function createLoggerInternal(bindings: LogContext): Logger {
    const write = IS_PRODUCTION ? writeJson : writePretty;

    function log(level: LogLevel, msg: string, ctx?: LogContext): void {
        if (LEVEL_VALUES[level] < MIN_LEVEL) return;
        write(level, msg, bindings, normalizeContext(ctx));
    }

    return {
        debug: (msg, ctx) => log('debug', msg, ctx),
        info: (msg, ctx) => log('info', msg, ctx),
        warn: (msg, ctx) => log('warn', msg, ctx),
        error: (msg, ctx) => log('error', msg, ctx),
        fatal: (msg, ctx) => log('fatal', msg, ctx),
        child: childBindings =>
            createLoggerInternal({ ...bindings, ...childBindings }),
    };
}

// ── Exports ─────────────────────────────────────────────────

/** Root logger instance. Use logger.child({ module: 'xxx' }) to scope. */
export const logger = createLoggerInternal({ service: 'subcult' });

/**
 * Create a standalone logger — useful for workers and scripts
 * that don't share the Next.js process.
 */
export function createLogger(bindings: LogContext = {}): Logger {
    return createLoggerInternal(bindings);
}
