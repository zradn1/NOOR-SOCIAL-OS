import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "kysely";
import type { WorkspaceRole } from "@/lib/auth/permissions";
import { assertCan, type WorkspaceContext } from "@/server/auth/guard";
import { getDb, withUser } from "@/server/db/client";
import { env } from "@/server/env";
import { AppError, notFound } from "@/server/errors";
import { recordAudit } from "./audit";
import { hashInvitationToken } from "./members";

type Meta = { ipHash?: string | null; userAgent?: string | null };

export type WorkspaceOverview = {
  id: string;
  slug: string;
  name: string;
  kind: "internal" | "client";
  isDemo: boolean;
  description: string | null;
  timezone: string;
  accounts: number;
  scheduled: number;
  assigned: number;
  guests: number;
  lastActivityAt: string | null;
  createdAt: string;
};

/**
 * Every workspace of the organization the current user can open, with light
 * activity stats. RLS limits the list to accessible workspaces, so non-admin
 * members only see the ones they are assigned to.
 */
export async function listWorkspaceOverview(ctx: WorkspaceContext, db = getDb()): Promise<WorkspaceOverview[]> {
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("workspaces as w")
        .select([
          "w.id",
          "w.slug",
          "w.name",
          "w.kind",
          "w.is_demo",
          "w.description",
          "w.timezone",
          "w.created_at",
          (eb) =>
            eb
              .selectFrom("social_accounts as a")
              .select((e) => e.fn.countAll<number>().as("n"))
              .whereRef("a.workspace_id", "=", "w.id")
              .where("a.deleted_at", "is", null)
              .as("accounts"),
          (eb) =>
            eb
              .selectFrom("content_posts as p")
              .select((e) => e.fn.countAll<number>().as("n"))
              .whereRef("p.workspace_id", "=", "w.id")
              .where("p.status", "=", "scheduled")
              .where("p.deleted_at", "is", null)
              .as("scheduled"),
          (eb) =>
            eb
              .selectFrom("content_posts as p")
              .select((e) => e.fn.max("p.updated_at").as("t"))
              .whereRef("p.workspace_id", "=", "w.id")
              .as("last_activity_at"),
          (eb) =>
            eb
              .selectFrom("workspace_members as wm")
              .innerJoin("organization_members as om", (j) =>
                j.onRef("om.user_id", "=", "wm.user_id").onRef("om.organization_id", "=", "wm.organization_id"),
              )
              .select((e) => e.fn.countAll<number>().as("n"))
              .whereRef("wm.workspace_id", "=", "w.id")
              .where("om.is_client_guest", "=", false)
              .as("assigned"),
          (eb) =>
            eb
              .selectFrom("workspace_members as wm")
              .innerJoin("organization_members as om", (j) =>
                j.onRef("om.user_id", "=", "wm.user_id").onRef("om.organization_id", "=", "wm.organization_id"),
              )
              .select((e) => e.fn.countAll<number>().as("n"))
              .whereRef("wm.workspace_id", "=", "w.id")
              .where("om.is_client_guest", "=", true)
              .as("guests"),
        ])
        .where("w.organization_id", "=", ctx.organization.id)
        .where("w.deleted_at", "is", null)
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
    description: r.description,
    timezone: r.timezone,
    accounts: Number(r.accounts ?? 0),
    scheduled: Number(r.scheduled ?? 0),
    assigned: Number(r.assigned ?? 0),
    guests: Number(r.guests ?? 0),
    lastActivityAt: r.last_activity_at ? new Date(r.last_activity_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export type ClientGuest = { userId: string; email: string; fullName: string | null; role: WorkspaceRole; joinedAt: string };
export type ClientGuestInvitation = { id: string; email: string; role: WorkspaceRole; expiresAt: string; createdAt: string };

/** Guests of the current client workspace and their pending invitations. */
export async function listClientGuests(ctx: WorkspaceContext, db = getDb()) {
  if (ctx.workspace.kind !== "client" || ctx.workspace.isDemo) return { guests: [], invitations: [] };
  return withUser(
    ctx.identity,
    async (trx) => {
      const guests = await trx
        .selectFrom("workspace_members as wm")
        .innerJoin("organization_members as om", (j) =>
          j.onRef("om.user_id", "=", "wm.user_id").onRef("om.organization_id", "=", "wm.organization_id"),
        )
        .innerJoin("profiles as p", "p.id", "wm.user_id")
        .select(["wm.user_id", "wm.role", "wm.created_at", "p.email", "p.full_name"])
        .where("wm.workspace_id", "=", ctx.workspace.id)
        .where("om.is_client_guest", "=", true)
        .orderBy("p.email")
        .execute();
      const invitations = await trx
        .selectFrom("organization_invitations")
        .select(["id", "email", "workspace_role", "expires_at", "created_at"])
        .where("client_guest", "=", true)
        .where(sql<boolean>`workspace_ids[1] = ${ctx.workspace.id}::uuid`)
        .where("accepted_at", "is", null)
        .where("revoked_at", "is", null)
        .orderBy("created_at", "desc")
        .execute();
      return {
        guests: guests.map((g) => ({
          userId: g.user_id,
          email: g.email,
          fullName: g.full_name,
          role: g.role,
          joinedAt: new Date(g.created_at).toISOString(),
        })) satisfies ClientGuest[],
        invitations: invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.workspace_role ?? "viewer",
          expiresAt: new Date(i.expires_at).toISOString(),
          createdAt: new Date(i.created_at).toISOString(),
        })) satisfies ClientGuestInvitation[],
      };
    },
    db,
  );
}

function assertManagesClient(ctx: WorkspaceContext) {
  assertCan(ctx, "workspace.members");
  if (ctx.isClientGuest) throw new AppError("FORBIDDEN", "Client guests can't manage access.");
  if (ctx.workspace.kind !== "client" || ctx.workspace.isDemo) {
    throw new AppError("VALIDATION", "Client guests can only join client workspaces.");
  }
}

/**
 * Invites someone from the client's side into this workspace only. Returns a
 * one-time link (no email provider is configured); only its hash is stored.
 */
export async function inviteClientGuest(
  ctx: WorkspaceContext,
  input: { email: string; role: Exclude<WorkspaceRole, "admin"> },
  meta: Meta = {},
  db = getDb(),
) {
  assertManagesClient(ctx);
  const token = randomBytes(32).toString("base64url");
  const id = await withUser(
    ctx.identity,
    async (trx) => {
      const { rows } = await sql<{ id: string }>`
        select app.create_client_invitation(
          ${ctx.workspace.id}::uuid, ${input.email}, ${input.role}::workspace_role, ${hashInvitationToken(token)}
        ) as id
      `.execute(trx);
      return rows[0]!.id;
    },
    db,
  );
  await recordAudit(
    {
      action: "client_guest.invited",
      organizationId: ctx.organization.id,
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      targetType: "invitation",
      targetId: id,
      metadata: { email: input.email, role: input.role },
      ...meta,
    },
    db,
  );
  return { id, link: `${env().NEXT_PUBLIC_APP_URL}/invite/${token}` };
}

export async function revokeClientInvitation(ctx: WorkspaceContext, invitationId: string, meta: Meta = {}, db = getDb()) {
  assertManagesClient(ctx);
  const result = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .updateTable("organization_invitations")
        .set({ revoked_at: new Date() })
        .where("id", "=", invitationId)
        .where("client_guest", "=", true)
        .where(sql<boolean>`workspace_ids[1] = ${ctx.workspace.id}::uuid`)
        .where("accepted_at", "is", null)
        .where("revoked_at", "is", null)
        .executeTakeFirst(),
    db,
  );
  if (!result.numUpdatedRows) throw notFound("That invitation is no longer pending.");
  await recordAudit(
    {
      action: "client_guest.invitation_revoked",
      organizationId: ctx.organization.id,
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      targetType: "invitation",
      targetId: invitationId,
      ...meta,
    },
    db,
  );
}

/** Removes a guest from the organization entirely (they only ever had this workspace). */
export async function removeClientGuest(ctx: WorkspaceContext, userId: string, meta: Meta = {}, db = getDb()) {
  assertManagesClient(ctx);
  const removed = await withUser(
    ctx.identity,
    async (trx) => {
      const assigned = await trx
        .selectFrom("workspace_members")
        .select("user_id")
        .where("workspace_id", "=", ctx.workspace.id)
        .where("user_id", "=", userId)
        .executeTakeFirst();
      if (!assigned) return 0;
      const result = await trx
        .deleteFrom("organization_members")
        .where("organization_id", "=", ctx.organization.id)
        .where("user_id", "=", userId)
        .where("is_client_guest", "=", true)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
    db,
  );
  if (!removed) throw notFound("That guest no longer has access.");
  await recordAudit(
    {
      action: "client_guest.removed",
      organizationId: ctx.organization.id,
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      targetType: "user",
      targetId: userId,
      ...meta,
    },
    db,
  );
}
