/**
 * Local database tooling (development and tests only).
 *
 *   pnpm db:reset            drop + recreate the dev database, apply shim, migrations, seed
 *   pnpm db:migrate          apply pending migrations to DATABASE_URL
 *
 * Hosted Supabase projects are migrated with the Supabase CLI
 * (`supabase db push`), never with this script.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const ROOT = path.resolve(import.meta.dirname, "../..");
export const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");
const SHIM = path.join(ROOT, "tooling/local-db/supabase-shim.sql");
const SEED = path.join(ROOT, "supabase/seed.sql");

export function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
}

export async function applyShim(client: Client) {
  await client.query(readFileSync(SHIM, "utf8"));
}

export async function applyMigrations(client: Client, { log = false } = {}) {
  await client.query(`
    create schema if not exists local_meta;
    create table if not exists local_meta.applied_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const { rows } = await client.query<{ version: string }>("select version from local_meta.applied_migrations");
  const applied = new Set(rows.map((r) => r.version));
  for (const file of listMigrations()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into local_meta.applied_migrations (version) values ($1)", [file]);
      await client.query("commit");
      if (log) console.log(`  applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
  }
}

export async function applySeed(client: Client) {
  try {
    await client.query(readFileSync(SEED, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function adminUrl() {
  return process.env.LOCAL_PG_ADMIN_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
}

export function databaseUrl(dbName: string) {
  const url = new URL(adminUrl());
  url.pathname = `/${dbName}`;
  return url.toString();
}

export async function recreateDatabase(dbName: string, { template }: { template?: string } = {}) {
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`Unsafe database name: ${dbName}`);
  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.query(template ? `create database ${dbName} template ${template}` : `create database ${dbName}`);
  } finally {
    await admin.end();
  }
}

export async function dropDatabase(dbName: string) {
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`Unsafe database name: ${dbName}`);
  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${dbName} with (force)`);
  } finally {
    await admin.end();
  }
}

/** Fresh database with shim + all migrations (+ optional seed). */
export async function buildDatabase(dbName: string, { seed = false, log = false } = {}) {
  await recreateDatabase(dbName);
  const client = new Client({ connectionString: databaseUrl(dbName) });
  await client.connect();
  try {
    await applyShim(client);
    await applyMigrations(client, { log });
    if (seed) await applySeed(client);
  } finally {
    await client.end();
  }
}

async function main() {
  const [command] = process.argv.slice(2);
  if (command === "reset") {
    const dbName = process.env.LOCAL_DB_NAME ?? "noor_dev";
    console.log(`Rebuilding ${dbName} (shim + migrations + seed)…`);
    await buildDatabase(dbName, { seed: true, log: true });
    console.log(`Done. DATABASE_URL=${databaseUrl(dbName)}`);
  } else if (command === "migrate") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await applyMigrations(client, { log: true });
    } finally {
      await client.end();
    }
  } else {
    console.log("Usage: tsx tooling/local-db/apply.ts <reset|migrate>");
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
