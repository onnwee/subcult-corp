// PostgreSQL connection pool — server-side only
// Lazily initialised so `next build` can compile without a live DATABASE_URL.
import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;
let _sql: Sql | undefined;

function getSql(): Sql {
    if (!_sql) {
        if (!process.env.DATABASE_URL) {
            throw new Error('Missing DATABASE_URL environment variable');
        }
        _sql = postgres(process.env.DATABASE_URL, {
            max: 10,
            idle_timeout: 20,
            connect_timeout: 10,
        });
    }
    return _sql;
}

// Proxy that forwards tagged-template calls (sql`...`) and property access
// (sql.begin, sql.end, etc.) to the lazily-created connection.
// The target must be a function so the `apply` trap fires for template calls.
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
    apply(_target, thisArg, args) {
        return Reflect.apply(getSql(), thisArg, args);
    },
    get(_target, prop, receiver) {
        return Reflect.get(getSql(), prop, receiver);
    },
});

/**
 * Properly serialize a value as JSONB for postgres.js.
 * Wraps sql.json() with a type cast so Record<string, unknown> is accepted.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function jsonb(value: any) {
    return getSql().json(value);
}
