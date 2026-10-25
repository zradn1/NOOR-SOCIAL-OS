import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "kysely";
import { assignableRoles, ROLE_RANK, type Role, type WorkspaceRole } from "@/lib/auth/permissions";
import { assertCan, type WorkspaceContext } from "@/server/auth/context";
import { getDb, withUser } from "@/server/db/client";
import { env } from "@/server/env";
import { AppError, forbidden, notFound } from "@/server/errors";
import { recordAudit } from "./audit";

type Meta = { ipHash?: string | null; userAgent?: string | null };

export type OrganizationMember = {
  userId: string;
  email: string;
  fullName: string | null;
  role: Role;
  joinedAt: string;
  workspaceCount: number;
};

export async function listOrganizationMembers(ctx: WorkspaceContext, db = getDb()): Promise<OrganizationMember[]> {
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("organization_members as m")
        .innerJoin("profiles as p", "p.id", "m.user_id")
        .select([
          "m.user_id",
          "m.role",
          "m.created_at",
          "p.email",
          "p.full_name",
          (eb) =>
            eb
              .selectFrom("workspace_members as wm")
              .select((e) => e.fn.countAll<number>().as("n"))
              .whereRef("wm.user_id", "=", "m.user_id")
              .whereRef("wm.organization_id", "=", "m.organization_id")
              .as("workspace_count"),
        ])
        .where("m.organization_id", "=", ctx.organization.id)
        .orderBy(sql`array_position(array['owner','admin','editor','analyst','viewer']::member_role[], m.role)`)
        .orderBy("p.email")
        .execute(),
    db,
  );
  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    fullName: r.full_name,
    role: r.role,
    joinedAt: r.created_at.toISOString(),
    workspaceCount: Number(r.workspace_count ?? 0),
  }));
}

export async function changeMemberRole(ctx: WorkspaceContext, userId: string, role: Role, meta: Meta = {}, db = getDb()) {
  assertCan(ctx, "org.members");
  if (!assignableRoles(ctx.orgRole).includes(role)) throw forbidden("You can't assign a role above your own.");
  const previous = await withUser(
    ctx.identity,
    async (trx) => {
      const current = await trx
        .selectFrom("organization_members")
        .select("role")
        .where("organization_id", "=", ctx.organization.id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!current) throw notFound("That member no longer exists.");
      if (current.role === "owner" && ctx.orgRole !== "owner") throw forbidden("Only owners can change an owner's role.");
      if (ROLE_RANK[current.role] > ROLE_RANK[ctx.orgRole]) throw forbidden();
      const result = await trx
        .updateTable("organization_members")
        .set({ role })
        .where("organization_id", "=", ctx.organization.id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!result.numUpdatedRows) throw forbidden();
      return current.role;
    },
    db,
  );
  await recordAudit(
    {
      action: "member.role_changed",
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      targetType: "user",
      targetId: userId,
      metadata: { from: previous, to: role },
      ...meta,
    },
    db,
  );
}

export async function removeMember(ctx: WorkspaceContext, userId: string, meta: Meta = {}, db = getDb()) {
  const leaving = userId === ctx.user.id;
  if (!leaving) assertCan(ctx, "org.members");
  await withUser(
    ctx.identity,
    async (trx) => {
      const target = await trx
        .selectFrom("organization_members")
        .select("role")
        .where("organization_id", "=", ctx.organization.id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!target) throw notFound("That member no longer exists.");
      if (!leaving && ROLE_RANK[target.role] > ROLE_RANK[ctx.orgRole]) throw forbidden();
      const result = await trx
        .deleteFrom("organization_members")
        .where("organization_id", "=", ctx.organization.id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!result.numDeletedRows) throw forbidden();
    },
    db,
  );
  await recordAudit(
    {
      action: leaving ? "member.left" : "member.removed",
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      targetType: "user",
      targetId: userId,
      ...meta,
    },
    db,
  );
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type InvitationSummary = {
  id: string;
  email: string;
  role: Role;
  workspaceCount: number;
  expiresAt: string;
  createdAt: string;
};

export async function listPendingInvitations(ctx: WorkspaceContext, db = getDb()): Promise<InvitationSummary[]> {
  if (ROLE_RANK[ctx.orgRole] < ROLE_RANK.admin) return [];
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("organization_invitations")
        .select(["id", "email", "role", "workspace_ids", "expires_at", "created_at"])
        .where("organization_id", "=", ctx.organization.id)
        .where("accepted_at", "is", null)
        .where("revoked_at", "is", null)
        .orderBy("created_at", "desc")
        .execute(),
    db,
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    workspaceCount: r.workspace_ids.length,
    expiresAt: r.expires_at.toISOString(),
    createdAt: r.created_at.toISOString(),
  }));
}

/**
 * Creates an invitation and returns the one-time acceptance link. Only the
 * token's SHA-256 is stored; the link cannot be recovered later. No email
 * provider is configured, so the inviter shares the link themselves.
 */
export async function createInvitation(
  ctx: WorkspaceContext,
  input: { email: string; role: Role; workspaceIds: string[]; workspaceRole?: WorkspaceRole },
  meta: Meta = {},
  db = getDb(),
) {
  assertCan(ctx, "org.members");
  if (!assignableRoles(ctx.orgRole).includes(input.role) || input.role === "owner") {
    throw forbidden("You can't invite someone with a role above your own.");
  }
  const workspaceRole = input.workspaceIds.length ? (input.workspaceRole ?? "viewer") : null;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInvitationToken(token);
  const id = await withUser(
    ctx.identity,
    async (trx) => {
      const { rows } = await sql<{ id: string }>`
        select app.create_invitation(
          ${ctx.organization.id}::uuid, ${input.email}, ${input.role}::member_role,
          ${input.workspaceIds}::uuid[], ${workspaceRole}::workspace_role, ${tokenHash}
        ) as id
      `.execute(trx);
      return rows[0]!.id;
    },
    db,
  );
  await recordAudit(
    {
      action: "invitation.created",
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      targetType: "invitation",
      targetId: id,
      metadata: { email: input.email, role: input.role, workspaces: input.workspaceIds.length },
      ...meta,
    },
    db,
  );
  return { id, link: `${env().NEXT_PUBLIC_APP_URL}/invite/${token}` };
}

export async function revokeInvitation(ctx: WorkspaceContext, invitationId: string, meta: Meta = {}, db = getDb()) {
  assertCan(ctx, "org.members");
  const result = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .updateTable("organization_invitations")
        .set({ revoked_at: new Date() })
        .where("id", "=", invitationId)
        .where("organization_id", "=", ctx.organization.id)
        .where("accepted_at", "is", null)
        .where("revoked_at", "is", null)
        .executeTakeFirst(),
    db,
  );
  if (!result.numUpdatedRows) throw notFound("That invitation is no longer pending.");
  await recordAudit(
    {
      action: "invitation.revoked",
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      targetType: "invitation",
      targetId: invitationId,
      ...meta,
    },
    db,
  );
}

/** Public details for the acceptance screen; possession of the token authorizes viewing them. */
export async function getInvitationPreview(token: string, db = getDb()) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const row = await db
    .selectFrom("organization_invitations as i")
    .innerJoin("organizations as o", "o.id", "i.organization_id")
    .leftJoin("profiles as p", "p.id", "i.invited_by")
    .select(["i.email", "i.role", "i.expires_at", "i.accepted_at", "i.revoked_at", "o.name as organization_name", "p.full_name as inviter"])
    .where("i.token_hash", "=", hashInvitationToken(token))
    .where("o.deleted_at", "is", null)
    .executeTakeFirst();
  if (!row) return null;
  const status = row.revoked_at || row.accepted_at ? "invalid" : row.expires_at <= new Date() ? "expired" : "pending";
  return { email: row.email, role: row.role, organizationName: row.organization_name, inviter: row.inviter, status };
}

export async function acceptInvitation(identity: WorkspaceContext["identity"], token: string, meta: Meta = {}, db = getDb()) {
  const tokenHash = hashInvitationToken(token);
  const result = await withUser(
    identity,
    async (trx) => {
      const { rows } = await sql<{ organization_id: string; workspace_slug: string | null }>`
        select * from app.accept_invitation(${tokenHash})
      `.execute(trx);
      return rows[0]!;
    },
    db,
  );
  await recordAudit(
    {
      action: "invitation.accepted",
      organizationId: result.organization_id,
      actorId: identity.userId,
      targetType: "user",
      targetId: identity.userId,
      ...meta,
    },
    db,
  );
  return { organizationId: result.organization_id, workspaceSlug: result.workspace_slug };
}

// ---------------------------------------------------------------------------
// Workspace assignments
// ---------------------------------------------------------------------------

export type WorkspaceAccessRow = {
  userId: string;
  email: string;
  fullName: string | null;
  orgRole: Role;
  /** Explicit assignment, or null when access is inherited from an org admin role. */
  workspaceRole: WorkspaceRole | null;
  effectiveRole: Role | null;
};

/** Every organization member with their access to this workspace. */
export async function listWorkspaceAccess(ctx: WorkspaceContext, db = getDb()): Promise<WorkspaceAccessRow[]> {
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("organization_members as m")
        .innerJoin("profiles as p", "p.id", "m.user_id")
        .leftJoin("workspace_members as wm", (join) =>
          join.onRef("wm.user_id", "=", "m.user_id").on("wm.workspace_id", "=", ctx.workspace.id),
        )
        .select(["m.user_id", "m.role as org_role", "wm.role as workspace_role", "p.email", "p.full_name"])
        .where("m.organization_id", "=", ctx.organization.id)
        .orderBy("p.email")
        .execute(),
    db,
  );
  return rows.map((r) => {
    const inherited = r.org_role === "owner" || r.org_role === "admin";
    return {
      userId: r.user_id,
      email: r.email,
      fullName: r.full_name,
      orgRole: r.org_role,
      workspaceRole: r.workspace_role,
      effectiveRole: inherited ? r.org_role : (r.workspace_role ?? null),
    };
  });
}

export async function setWorkspaceAssignment(
  ctx: WorkspaceContext,
  userId: string,
  role: WorkspaceRole | null,
  meta: Meta = {},
  db = getDb(),
) {
  assertCan(ctx, "workspace.members");
  await withUser(
    ctx.identity,
    async (trx) => {
      if (role === null) {
        await trx
          .deleteFrom("workspace_members")
          .where("workspace_id", "=", ctx.workspace.id)
          .where("user_id", "=", userId)
          .execute();
        return;
      }
      await trx
        .insertInto("workspace_members")
        .values({
          workspace_id: ctx.workspace.id,
          organization_id: ctx.organization.id,
          user_id: userId,
          role,
          assigned_by: ctx.user.id,
        })
        .onConflict((oc) => oc.columns(["workspace_id", "user_id"]).doUpdateSet({ role }))
        .execute();
    },
    db,
  ).catch((error: { code?: string }) => {
    if (error?.code === "23503") throw new AppError("VALIDATION", "That person isn't a member of this organization.");
    throw error;
  });
  await recordAudit(
    {
      action: role ? "workspace.member_assigned" : "workspace.member_unassigned",
      organizationId: ctx.organization.id,
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      targetType: "user",
      targetId: userId,
      metadata: role ? { role } : {},
      isDemo: ctx.workspace.isDemo,
      ...meta,
    },
    db,
  );
}
