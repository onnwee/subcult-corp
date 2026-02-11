/**
 * Structured logger for .mjs workers and seed scripts.
 * Standalone version — no TypeScript, no imports from src/.
 *
 * Usage:
 *   import { createLogger } from '../lib/logger.mjs';
 *   const log = createLogger({ service: 'roundtable-worker' });
 *   log.info('Session started', { sessionId: '123' });
 */

const LEVEL_VALUES = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    fatal: 50,
};

const LEVEL_COLORS = {
    debug: '\x1b[90m', // gray
    info: '\x1b[36m', // cyan
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
    fatal: '\x1b[35m', // magenta
};

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL ?? (IS_PRODUCTION ? 'info' : 'debug');
const MIN_LEVEL = LEVEL_VALUES[LOG_LEVEL] ?? LEVEL_VALUES.info;

function serializeError(err) {
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

function normalizeContext(ctx) {
    if (!ctx) return undefined;
    const normalized = {};
    for (const [key, value] of Object.entries(ctx)) {
        if (key === 'error' || key === 'err') {
            normalized.error = serializeError(value);
        } else {
            normalized[key] = value;
        }
    }
    return normalized;
}

function writeJson(level, msg, bindings, ctx) {
    const entry = {
        level,
        time: new Date().toISOString(),
        msg,
        ...bindings,
        ...(ctx ?? {}),
    };
    process.stderr.write(JSON.stringify(entry) + '\n');
}

function writePretty(level, msg, bindings, ctx) {
    const color = LEVEL_COLORS[level];
    const time = new Date().toISOString().slice(11, 23);
    const tag = level.toUpperCase().padEnd(5);

    const bindingStr =
        Object.keys(bindings).length > 0 ?
            ` ${DIM}${Object.entries(bindings)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(' ')}${RESET}`
        :   '';

    let line = `${DIM}${time}${RESET} ${color}${tag}${RESET}${bindingStr} ${msg}`;

    if (ctx && Object.keys(ctx).length > 0) {
        const parts = [];
        for (const [key, value] of Object.entries(ctx)) {
            if (
                key === 'error' &&
                typeof value === 'object' &&
                value !== null
            ) {
                parts.push(`error=${value.message ?? String(value)}`);
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
        if (parts.length > 0) {
            line += ` ${DIM}${parts.join(' ')}${RESET}`;
        }
    }

    process.stderr.write(line + '\n');
}

/**
 * Create a logger instance with the given bindings.
 * @param {Record<string, unknown>} bindings - Static context for all log entries
 * @returns {import('./logger').Logger}
 */
export function createLogger(bindings = {}) {
    const write = IS_PRODUCTION ? writeJson : writePretty;

    function log(level, msg, ctx) {
        if (LEVEL_VALUES[level] < MIN_LEVEL) return;
        write(level, msg, bindings, normalizeContext(ctx));
    }

    return {
        debug: (msg, ctx) => log('debug', msg, ctx),
        info: (msg, ctx) => log('info', msg, ctx),
        warn: (msg, ctx) => log('warn', msg, ctx),
        error: (msg, ctx) => log('error', msg, ctx),
        fatal: (msg, ctx) => log('fatal', msg, ctx),
        child: childBindings => createLogger({ ...bindings, ...childBindings }),
    };
}
