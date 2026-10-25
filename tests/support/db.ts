import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { databaseUrl, dropDatabase, recreateDatabase } from "../../tooling/local-db/apply";

const TEMPLATE_DB = "noor_test_template";

export type TestDb = {
  name: string;
  url: string;
  /** Privileged connection (table owner; RLS bypassed), like the server's system connection. */
  sys: Client;
  close: () => Promise<void>;
};

/** A fresh, fully migrated database cloned from the template. */
export async function createTestDb(): Promise<TestDb> {
  const name = `noor_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await recreateDatabase(name, { template: TEMPLATE_DB });
  const url = databaseUrl(name);
  const sys = new Client({ connectionString: url });
  await sys.connect();
  return {
    name,
    url,
    sys,
    close: async () => {
      await sys.end();
      await dropDatabase(name);
    },
  };
}

export async function createAuthUser(sys: Client, email: string, fullName?: string): Promise<string> {
  const id = randomUUID();
  await sys.query("insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, now())", [
    id,
    email,
    JSON.stringify(fullName ? { full_name: fullName } : {}),
  ]);
  return id;
}

/**
 * Runs `fn` in a transaction as the API role `authenticated` with the given
 * user's claims — exactly how PostgREST and the app's withUser() do it.
 * Rolls back unless `commit` is set.
 */
export async function asUser<T>(
  db: TestDb,
  userId: string | null,
  fn: (client: Client) => Promise<T>,
  { commit = false }: { commit?: boolean } = {},
): Promise<T> {
  const client = new Client({ connectionString: db.url });
  await client.connect();
  try {
    await client.query("begin");
    const claims = userId ? { sub: userId, role: "authenticated" } : { role: "anon" };
    await client.query("select set_config('request.jwt.claims', $1, true), set_config('role', $2, true)", [
      JSON.stringify(claims),
      userId ? "authenticated" : "anon",
    ]);
    const result = await fn(client);
    await client.query(commit ? "commit" : "rollback");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

/** Expect a query to fail; returns the Postgres error. */
export async function pgError(promise: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error("Expected the query to fail, but it succeeded");
}

export type OrgFixture = { organizationId: string; workspaceId: string; workspaceSlug: string };

export async function createOrganization(db: TestDb, ownerId: string, name = "Acme"): Promise<OrgFixture> {
  return asUser(
    db,
    ownerId,
    async (c) => {
      const { rows } = await c.query("select * from app.create_organization($1, $2, 'UTC')", [name, `${name} HQ`]);
      return {
        organizationId: rows[0].organization_id,
        workspaceId: rows[0].workspace_id,
        workspaceSlug: rows[0].workspace_slug,
      };
    },
    { commit: true },
  );
}

/** Adds a member directly through the privileged connection (test setup only). */
export async function addMember(db: TestDb, organizationId: string, userId: string, role: string) {
  await db.sys.query("insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3)", [
    organizationId,
    userId,
    role,
  ]);
}

export async function assignWorkspace(db: TestDb, workspaceId: string, organizationId: string, userId: string, role: string) {
  await db.sys.query(
    "insert into public.workspace_members (workspace_id, organization_id, user_id, role) values ($1, $2, $3, $4)",
    [workspaceId, organizationId, userId, role],
  );
}

export async function setPlan(db: TestDb, organizationId: string, planId: string) {
  await db.sys.query(
    "update public.subscriptions set plan_id = $2, provider = case when $2 = 'free' then 'none' else 'manual' end where organization_id = $1",
    [organizationId, planId],
  );
}
