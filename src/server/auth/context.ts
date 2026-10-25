import "server-only";
import { sql } from "kysely";
import { notFound } from "next/navigation";
import { cache } from "react";
import { isRole, type Permission } from "@/lib/auth/permissions";
import { getDb, withUser } from "@/server/db/client";
import { forbidden } from "@/server/errors";
import { assertCan, type WorkspaceContext } from "./guard";
import { getSessionUser, identityOf, requireUser } from "./session";

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export type { WorkspaceContext } from "./guard";
export { assertCan, permits } from "./guard";

/** Loads a workspace through RLS; null when it doesn't exist or isn't accessible. */
export const getWorkspaceContext = cache(async (slug: string): Promise<WorkspaceContext | null> => {
  const user = await getSessionUser();
  if (!user || !SLUG_PATTERN.test(slug)) return null;
  const identity = identityOf(user);
  const row = await withUser(identity, (trx) =>
    trx
      .selectFrom("workspaces as w")
      .innerJoin("organizations as o", "o.id", "w.organization_id")
      .select([
        "w.id",
        "w.slug",
        "w.name",
        "w.kind",
        "w.is_demo",
        "w.timezone",
        "w.description",
        "w.organization_id",
        "o.name as org_name",
        "o.slug as org_slug",
        sql<string | null>`app.workspace_role(w.id)`.as("role"),
        sql<string | null>`app.org_role(o.id)::text`.as("org_role"),
        sql<boolean>`app.is_client_guest(o.id)`.as("is_client_guest"),
      ])
      .where("w.slug", "=", slug)
      .where("w.deleted_at", "is", null)
      .executeTakeFirst(),
  );
  if (!row || !isRole(row.role) || !isRole(row.org_role)) return null;
  return {
    user,
    identity,
    workspace: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      isDemo: row.is_demo,
      timezone: row.timezone,
      description: row.description,
      organizationId: row.organization_id,
    },
    organization: { id: row.organization_id, name: row.org_name, slug: row.org_slug },
    role: row.role,
    orgRole: row.org_role,
    isClientGuest: row.is_client_guest,
  };
});

/** For pages: redirects anonymous users, 404s inaccessible workspaces. */
export async function requireWorkspace(slug: string): Promise<WorkspaceContext> {
  await requireUser(`/w/${slug}/dashboard`);
  const ctx = await getWorkspaceContext(slug);
  if (!ctx) notFound();
  return ctx;
}

/** For actions and route handlers: throws AppError instead of navigating. */
export async function loadWorkspaceForAction(slug: string, permission: Permission): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext(slug);
  if (!ctx) throw forbidden("This workspace isn't available.");
  assertCan(ctx, permission);
  return ctx;
}

/** Platform administrators are checked through the privileged connection. */
export const isPlatformAdmin = cache(async (userId: string): Promise<boolean> => {
  const row = await getDb().selectFrom("platform_admins").select("user_id").where("user_id", "=", userId).executeTakeFirst();
  return Boolean(row);
});
