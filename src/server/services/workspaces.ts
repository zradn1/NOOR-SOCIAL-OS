import "server-only";
import { sql } from "kysely";
import { assertCan, type WorkspaceContext } from "@/server/auth/guard";
import { getDb, withUser } from "@/server/db/client";
import { forbidden } from "@/server/errors";
import { recordAudit } from "./audit";

type Meta = { ipHash?: string | null; userAgent?: string | null };

export async function createWorkspace(
  ctx: WorkspaceContext,
  input: { name: string; kind: "internal" | "client"; timezone: string; description?: string; isDemo?: boolean },
  meta: Meta = {},
  db = getDb(),
) {
  assertCan(ctx, input.isDemo ? "demo.manage" : "org.clients");
  const created = await withUser(
    ctx.identity,
    async (trx) => {
      const { rows } = await sql<{ workspace_id: string; workspace_slug: string }>`
        select * from app.create_workspace(
          ${ctx.organization.id}::uuid, ${input.name}, ${input.kind}::workspace_kind,
          ${input.timezone}, ${input.description ?? null}, ${input.isDemo ?? false}
        )
      `.execute(trx);
      return rows[0]!;
    },
    db,
  );
  await recordAudit(
    {
      action: input.isDemo ? "workspace.demo_created" : "workspace.created",
      organizationId: ctx.organization.id,
      workspaceId: created.workspace_id,
      actorId: ctx.user.id,
      targetType: "workspace",
      targetId: created.workspace_id,
      metadata: { name: input.name, kind: input.kind },
      isDemo: input.isDemo ?? false,
      ...meta,
    },
    db,
  );
  return { id: created.workspace_id, slug: created.workspace_slug };
}

export async function updateWorkspace(
  ctx: WorkspaceContext,
  input: { name: string; timezone: string; description?: string },
  meta: Meta = {},
  db = getDb(),
) {
  assertCan(ctx, "workspace.manage");
  const result = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .updateTable("workspaces")
        .set({ name: input.name, timezone: input.timezone, description: input.description || null })
        .where("id", "=", ctx.workspace.id)
        .executeTakeFirst(),
    db,
  );
  if (!result.numUpdatedRows) throw forbidden();
  await recordAudit(
    {
      action: "workspace.updated",
      organizationId: ctx.organization.id,
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      targetType: "workspace",
      targetId: ctx.workspace.id,
      metadata: { name: input.name, timezone: input.timezone },
      isDemo: ctx.workspace.isDemo,
      ...meta,
    },
    db,
  );
}

export async function deleteWorkspace(ctx: WorkspaceContext, meta: Meta = {}, db = getDb()) {
  assertCan(ctx, "org.clients");
  await withUser(ctx.identity, (trx) => sql`select app.delete_workspace(${ctx.workspace.id}::uuid)`.execute(trx), db);
  await recordAudit(
    {
      action: "workspace.deleted",
      organizationId: ctx.organization.id,
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      targetType: "workspace",
      targetId: ctx.workspace.id,
      isDemo: ctx.workspace.isDemo,
      ...meta,
    },
    db,
  );
}

export async function renameOrganization(ctx: WorkspaceContext, name: string, meta: Meta = {}, db = getDb()) {
  assertCan(ctx, "org.settings");
  const result = await withUser(
    ctx.identity,
    (trx) => trx.updateTable("organizations").set({ name }).where("id", "=", ctx.organization.id).executeTakeFirst(),
    db,
  );
  if (!result.numUpdatedRows) throw forbidden();
  await recordAudit(
    {
      action: "organization.renamed",
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      targetType: "organization",
      targetId: ctx.organization.id,
      metadata: { name },
      ...meta,
    },
    db,
  );
}
