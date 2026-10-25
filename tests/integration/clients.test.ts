import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DB } from "@/server/db/schema.generated";
import { toAppError } from "@/server/errors";
import { inviteClientGuest, listClientGuests, listWorkspaceOverview, removeClientGuest } from "@/server/services/clients";
import { acceptInvitation, changeMemberRole, hashInvitationToken } from "@/server/services/members";
import { createWorkspace } from "@/server/services/workspaces";
import { addMember, assignWorkspace, createAuthUser, createOrganization, createTestDb, setPlan, type OrgFixture, type TestDb } from "../support/db";
import { contextFor, kyselyFor } from "../support/services";

let db: TestDb;
let k: Kysely<DB>;
let owner: string;
let editor: string;
let guest: string;
let org: OrgFixture;
let clientA: { id: string; slug: string };
let clientB: { id: string; slug: string };

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    // Same mapping the action layer applies to database errors.
    return toAppError(error);
  }
  throw new Error("expected the call to fail");
}

beforeAll(async () => {
  db = await createTestDb();
  k = kyselyFor(db);
  owner = await createAuthUser(db.sys, "owner@studio.test", "Studio Owner");
  editor = await createAuthUser(db.sys, "editor@studio.test", "Studio Editor");
  guest = await createAuthUser(db.sys, "lead@brand.test", "Brand Lead");
  org = await createOrganization(db, owner, "Studio");
  await addMember(db, org.organizationId, editor, "editor");
});

afterAll(async () => {
  await k?.destroy();
  await db?.close();
});

describe("client workspaces", () => {
  it("need the Pro plan or above", async () => {
    const ctx = await contextFor(db, owner, org.workspaceId);
    const err = await errorOf(createWorkspace(ctx, { name: "Lumière", kind: "client", timezone: "Europe/Paris" }, {}, k));
    expect(err.code).toBe("PLAN_FEATURE");
  });

  it("are created by organization admins and listed with their stats", async () => {
    await setPlan(db, org.organizationId, "pro");
    const ctx = await contextFor(db, owner, org.workspaceId);
    clientA = await createWorkspace(ctx, { name: "Lumière", kind: "client", timezone: "Europe/Paris" }, {}, k);
    clientB = await createWorkspace(ctx, { name: "Atlas", kind: "client", timezone: "UTC" }, {}, k);
    await assignWorkspace(db, clientA.id, org.organizationId, editor, "editor");
    const overview = await listWorkspaceOverview(ctx, k);
    expect(overview.map((w) => [w.name, w.kind])).toEqual([
      ["Atlas", "client"],
      ["Lumière", "client"],
      ["Studio HQ", "internal"],
    ]);
    expect(overview.find((w) => w.id === clientA.id)).toMatchObject({ assigned: 1, guests: 0, accounts: 0 });
  });

  it("non-admin members only see the workspaces they're assigned to", async () => {
    const ctx = await contextFor(db, editor, clientA.id);
    expect((await listWorkspaceOverview(ctx, k)).map((w) => w.name)).toEqual(["Lumière"]);
  });
});

describe("client guests", () => {
  it("need the Agency plan", async () => {
    const ctx = await contextFor(db, owner, clientA.id);
    const err = await errorOf(inviteClientGuest(ctx, { email: "lead@brand.test", role: "editor" }, {}, k));
    expect(err.code).toBe("PLAN_FEATURE");
  });

  it("can't be invited into internal workspaces", async () => {
    await setPlan(db, org.organizationId, "agency");
    const ctx = await contextFor(db, owner, org.workspaceId);
    expect((await errorOf(inviteClientGuest(ctx, { email: "lead@brand.test", role: "viewer" }, {}, k))).code).toBe("VALIDATION");
  });

  it("can't be invited by members without admin rights", async () => {
    const ctx = await contextFor(db, editor, clientA.id);
    expect((await errorOf(inviteClientGuest(ctx, { email: "lead@brand.test", role: "viewer" }, {}, k))).code).toBe("FORBIDDEN");
  });

  it("join through a one-time link and land in their client workspace only", async () => {
    const ctx = await contextFor(db, owner, clientA.id);
    const { link } = await inviteClientGuest(ctx, { email: "lead@brand.test", role: "editor" }, {}, k);
    const token = link.split("/invite/")[1]!;
    const { rows } = await db.sys.query("select token_hash, client_guest from organization_invitations where email = 'lead@brand.test'");
    expect(rows[0]).toEqual({ token_hash: hashInvitationToken(token), client_guest: true });

    const pending = await listClientGuests(ctx, k);
    expect(pending.invitations.map((i) => [i.email, i.role])).toEqual([["lead@brand.test", "editor"]]);

    const accepted = await acceptInvitation({ userId: guest, email: "lead@brand.test", sessionId: null }, token, {}, k);
    expect(accepted.workspaceSlug).toBe(clientA.slug);

    const guestCtx = await contextFor(db, guest, clientA.id);
    expect(guestCtx).toMatchObject({ role: "editor", isClientGuest: true });
    expect((await listWorkspaceOverview(guestCtx, k)).map((w) => w.name)).toEqual(["Lumière"]);
    expect((await listClientGuests(ctx, k)).guests.map((g) => g.email)).toEqual(["lead@brand.test"]);
  });

  it("guests can't manage access, even with a workspace role", async () => {
    const guestCtx = await contextFor(db, guest, clientA.id);
    expect((await errorOf(inviteClientGuest(guestCtx, { email: "x@brand.test", role: "viewer" }, {}, k))).code).toBe("FORBIDDEN");
  });

  it("their organization role can't be changed from the members list", async () => {
    const ctx = await contextFor(db, owner, org.workspaceId);
    expect((await errorOf(changeMemberRole(ctx, guest, "admin", {}, k))).code).toBe("VALIDATION");
  });

  it("are removed from the organization by the client workspace's admin", async () => {
    const otherClientCtx = await contextFor(db, owner, clientB.id);
    expect((await errorOf(removeClientGuest(otherClientCtx, guest, {}, k))).code).toBe("NOT_FOUND");
    const ctx = await contextFor(db, owner, clientA.id);
    await removeClientGuest(ctx, guest, {}, k);
    const { rows } = await db.sys.query("select count(*)::int as n from organization_members where user_id = $1", [guest]);
    expect(rows[0].n).toBe(0);
    const audit = await db.sys.query("select action from audit_logs where organization_id = $1 and action like 'client_guest.%' order by created_at", [org.organizationId]);
    expect(audit.rows.map((r) => r.action)).toEqual(["client_guest.invited", "client_guest.removed"]);
  });
});
