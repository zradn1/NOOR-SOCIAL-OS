import { Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";
import type { Role } from "@/lib/auth/permissions";
import type { WorkspaceContext } from "@/server/auth/context";
import type { DB } from "@/server/db/schema.generated";
import type { TestDb } from "./db";

types.setTypeParser(20, (v) => Number.parseInt(v, 10));
types.setTypeParser(1082, (v) => v);

/** Kysely instance on a test database, as the app's server code would use it. */
export function kyselyFor(db: TestDb) {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: db.url, max: 4 }) }) });
}

/** Builds the same context requireWorkspace() returns, loaded from the database. */
export async function contextFor(db: TestDb, userId: string, workspaceId: string): Promise<WorkspaceContext> {
  const { rows } = await db.sys.query(
    `select w.*, o.name as org_name, o.slug as org_slug, p.email,
            (select case when om.role in ('owner','admin') then om.role::text else wm.role::text end
               from organization_members om
               left join workspace_members wm on wm.workspace_id = w.id and wm.user_id = om.user_id
              where om.organization_id = w.organization_id and om.user_id = $1) as role,
            (select role::text from organization_members where organization_id = w.organization_id and user_id = $1) as org_role,
            coalesce((select is_client_guest from organization_members where organization_id = w.organization_id and user_id = $1), false) as is_client_guest
       from workspaces w join organizations o on o.id = w.organization_id join profiles p on p.id = $1
      where w.id = $2`,
    [userId, workspaceId],
  );
  const r = rows[0];
  const user = { id: userId, email: r.email as string, sessionId: null };
  return {
    user,
    identity: { userId, email: user.email, sessionId: null },
    workspace: {
      id: r.id,
      slug: r.slug,
      name: r.name,
      kind: r.kind,
      isDemo: r.is_demo,
      timezone: r.timezone,
      description: r.description,
      organizationId: r.organization_id,
    },
    organization: { id: r.organization_id, name: r.org_name, slug: r.org_slug },
    role: r.role as Role,
    orgRole: r.org_role as Role,
    isClientGuest: r.is_client_guest,
  };
}
