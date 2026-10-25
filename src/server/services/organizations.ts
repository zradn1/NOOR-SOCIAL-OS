import "server-only";
import { sql } from "kysely";
import type { RlsIdentity } from "@/server/db/client";
import { getDb, withUser } from "@/server/db/client";
import { recordAudit } from "./audit";

export type WorkspaceSummary = {
  id: string;
  slug: string;
  name: string;
  kind: "internal" | "client";
  isDemo: boolean;
  organizationId: string;
  organizationName: string;
  role: string;
};

export async function createOrganization(
  identity: RlsIdentity,
  input: { organizationName: string; workspaceName: string; timezone: string },
  meta: { ipHash?: string | null; userAgent?: string | null } = {},
  db = getDb(),
) {
  const created = await withUser(
    identity,
    async (trx) => {
      const { rows } = await sql<{ organization_id: string; workspace_id: string; workspace_slug: string }>`
        select * from app.create_organization(${input.organizationName}, ${input.workspaceName}, ${input.timezone})
      `.execute(trx);
      return rows[0]!;
    },
    db,
  );
  await recordAudit(
    {
      action: "organization.created",
      organizationId: created.organization_id,
      workspaceId: created.workspace_id,
      actorId: identity.userId,
      targetType: "organization",
      targetId: created.organization_id,
      metadata: { name: input.organizationName },
      ...meta,
    },
    db,
  );
  return { organizationId: created.organization_id, workspaceId: created.workspace_id, workspaceSlug: created.workspace_slug };
}

/** Every workspace the user can open, grouped later by organization. */
export async function listAccessibleWorkspaces(identity: RlsIdentity, db = getDb()): Promise<WorkspaceSummary[]> {
  const rows = await withUser(
    identity,
    (trx) =>
      trx
        .selectFrom("workspaces as w")
        .innerJoin("organizations as o", "o.id", "w.organization_id")
        .select([
          "w.id",
          "w.slug",
          "w.name",
          "w.kind",
          "w.is_demo",
          "w.organization_id",
          "o.name as organization_name",
          sql<string>`app.workspace_role(w.id)`.as("role"),
        ])
        .where("w.deleted_at", "is", null)
        .orderBy("o.name")
        .orderBy("w.is_demo")
        .orderBy("w.name")
        .execute(),
    db,
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    kind: r.kind,
    isDemo: r.is_demo,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    role: r.role,
  }));
}

/** The profile's default workspace if still accessible, else the oldest accessible one. */
export async function resolveHomeWorkspaceSlug(identity: RlsIdentity, db = getDb()): Promise<string | null> {
  return withUser(
    identity,
    async (trx) => {
      const preferred = await trx
        .selectFrom("profiles as p")
        .innerJoin("workspaces as w", "w.id", "p.default_workspace_id")
        .select("w.slug")
        .where("p.id", "=", identity.userId)
        .where("w.deleted_at", "is", null)
        .executeTakeFirst();
      if (preferred) return preferred.slug;
      const first = await trx
        .selectFrom("workspaces")
        .select("slug")
        .where("deleted_at", "is", null)
        .orderBy("is_demo")
        .orderBy("created_at")
        .executeTakeFirst();
      return first?.slug ?? null;
    },
    db,
  );
}

/** Remembers the last workspace a user opened (RLS + trigger validate access). */
export async function rememberWorkspace(identity: RlsIdentity, workspaceId: string, db = getDb()) {
  await withUser(
    identity,
    (trx) =>
      trx
        .updateTable("profiles")
        .set({ default_workspace_id: workspaceId })
        .where("id", "=", identity.userId)
        .where("default_workspace_id", "is distinct from", workspaceId)
        .execute(),
    db,
  );
}

/** Where to send a signed-in user who has no specific destination. */
export async function homePath(identity: RlsIdentity, db = getDb()) {
  const slug = await resolveHomeWorkspaceSlug(identity, db);
  return slug ? `/w/${slug}/dashboard` : "/onboarding";
}
