import "server-only";
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import { Pool, types } from "pg";
import { databaseUrl, env } from "@/server/env";
import type { DB } from "./schema.generated";

export type Database = DB;
export type Tx = Transaction<DB>;
export type Executor = Kysely<DB> | Tx;

// int8 (bigint) counts come back as strings by default; our counts fit safely
// in a JS number.
types.setTypeParser(20, (value) => Number.parseInt(value, 10));
// `date` columns stay "YYYY-MM-DD" strings. The default parser builds a Date at
// local midnight, which shifts the day on servers outside UTC.
types.setTypeParser(1082, (value) => value);

const globalForDb = globalThis as unknown as { __noorDb?: Kysely<DB> };

function createDb() {
  const e = env();
  const pool = new Pool({
    connectionString: databaseUrl(),
    max: e.DATABASE_POOL_MAX,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: e.DATABASE_SSL === "disable" ? undefined : { rejectUnauthorized: e.DATABASE_SSL === "require" },
    application_name: "noor-social-os",
  });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

export function getDb(): Kysely<DB> {
  globalForDb.__noorDb ??= createDb();
  return globalForDb.__noorDb;
}

/** Claims for RLS. Always built from a verified session; role is fixed. */
export type RlsIdentity = { userId: string; email?: string | null; sessionId?: string | null };

/**
 * Runs `fn` in a transaction as the `authenticated` API role with the user's
 * verified claims, exactly as PostgREST does, so every RLS policy applies.
 */
export async function withUser<T>(identity: RlsIdentity, fn: (trx: Tx) => Promise<T>, db: Kysely<DB> = getDb()): Promise<T> {
  const claims = JSON.stringify({
    sub: identity.userId,
    role: "authenticated",
    aud: "authenticated",
    email: identity.email ?? undefined,
    session_id: identity.sessionId ?? undefined,
  });
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`.execute(trx);
    return fn(trx);
  });
}

/**
 * Privileged transaction (table owner; RLS bypassed). Only for system work
 * that has already been authorized: queue workers, webhooks, token storage,
 * audit logging, platform administration.
 */
export async function withSystem<T>(fn: (trx: Tx) => Promise<T>, db: Kysely<DB> = getDb()): Promise<T> {
  return db.transaction().execute(fn);
}
