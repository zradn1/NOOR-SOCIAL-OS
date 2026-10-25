import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DB } from "@/server/db/schema.generated";
import { toAppError } from "@/server/errors";
import { adminOverview, listAuditLogs, listOrganizations, listUsers, setOrganizationPlan, setUserSuspended } from "@/server/services/admin";
import { listOrganizationAudit, recordAudit } from "@/server/services/audit";
import { asUser, createAuthUser, createOrganization, createTestDb, setPlan, type OrgFixture, type TestDb } from "../support/db";
import { contextFor, kyselyFor } from "../support/services";

let db: TestDb;
let k: Kysely<DB>;
let operator: string;
let otherAdmin: string;
let owner: string;
let org: OrgFixture;

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return toAppError(error);
  }
  throw new Error("expected the call to fail");
}

beforeAll(async () => {
  db = await createTestDb();
  k = kyselyFor(db);
  operator = await createAuthUser(db.sys, "ops@noor.test", "Ops Person");
  otherAdmin = await createAuthUser(db.sys, "ops2@noor.test");
  owner = await createAuthUser(db.sys, "owner@tenant.test", "Tenant Owner");
  org = await createOrganization(db, owner, "Tenant");
  await db.sys.query("insert into platform_admins (user_id) values ($1), ($2)", [operator, otherAdmin]);
});

afterAll(async () => {
  await k?.destroy();
  await db?.close();
});

describe("platform admin access", () => {
  it("the admin table is invisible to every API role", async () => {
    const rows = await asUser(db, operator, async (c) => (await c.query("select * from platform_admins")).rows).catch((e) => e);
    expect(rows.code ?? rows.length).toBe("42501");
  });

  it("reads across tenants for operators", async () => {
    const overview = await adminOverview(k);
    expect(overview.organizations).toBe(1);
    expect((await listUsers({ q: "tenant" }, k)).map((u) => u.email)).toEqual(["owner@tenant.test"]);
    expect((await listOrganizations({}, k))[0]).toMatchObject({ name: "Tenant", owner: "owner@tenant.test", planId: "free" });
  });
});

describe("assigning plans", () => {
  it("is refused to anyone who isn't a platform admin", async () => {
    expect((await errorOf(setOrganizationPlan(owner, { organizationId: org.organizationId, planId: "agency", reason: "free upgrade" }, {}, k))).code).toBe("FORBIDDEN");
  });

  it("needs a reason, sets a manual plan, and audits it as an admin action", async () => {
    expect((await errorOf(setOrganizationPlan(operator, { organizationId: org.organizationId, planId: "pro", reason: "" }, {}, k))).code).toBe("VALIDATION");
    await setOrganizationPlan(operator, { organizationId: org.organizationId, planId: "pro", reason: "Invoiced annually" }, {}, k);
    const { rows } = await db.sys.query("select plan_id, provider, status::text from subscriptions where organization_id = $1", [org.organizationId]);
    expect(rows[0]).toEqual({ plan_id: "pro", provider: "manual", status: "active" });
    const [entry] = await listAuditLogs({ action: "admin." }, k);
    expect(entry).toMatchObject({ action: "admin.plan_assigned", actorType: "platform_admin", actor: "ops@noor.test" });
    expect(entry!.metadata).toMatchObject({ reason: "Invoiced annually", to: { plan: "pro" } });
  });

  it("returning to Free clears the manual provider", async () => {
    await setOrganizationPlan(operator, { organizationId: org.organizationId, planId: "free", reason: "Contract ended" }, {}, k);
    const { rows } = await db.sys.query("select plan_id, provider from subscriptions where organization_id = $1", [org.organizationId]);
    expect(rows[0]).toEqual({ plan_id: "free", provider: "none" });
  });

  it("won't override a live Stripe subscription", async () => {
    await db.sys.query(
      "update subscriptions set plan_id = 'starter', provider = 'stripe', provider_subscription_id = 'sub_live', status = 'active' where organization_id = $1",
      [org.organizationId],
    );
    expect((await errorOf(setOrganizationPlan(operator, { organizationId: org.organizationId, planId: "agency", reason: "test" }, {}, k))).code).toBe("CONFLICT");
    await db.sys.query("update subscriptions set plan_id = 'free', provider = 'none', provider_subscription_id = null where organization_id = $1", [org.organizationId]);
  });
});

describe("suspending users", () => {
  const auth = { ban: vi.fn(async () => {}) };

  it("guards against mistakes and non-admins", async () => {
    expect((await errorOf(setUserSuspended(owner, { userId: operator, suspended: true, reason: "nope" }, auth, {}, k))).code).toBe("FORBIDDEN");
    expect((await errorOf(setUserSuspended(operator, { userId: operator, suspended: true, reason: "oops" }, auth, {}, k))).code).toBe("VALIDATION");
    expect((await errorOf(setUserSuspended(operator, { userId: otherAdmin, suspended: true, reason: "oops" }, auth, {}, k))).code).toBe("VALIDATION");
    expect(auth.ban).not.toHaveBeenCalled();
  });

  it("suspends through the auth provider and audits it", async () => {
    await setUserSuspended(operator, { userId: owner, suspended: true, reason: "Abuse report #12" }, auth, {}, k);
    expect(auth.ban).toHaveBeenCalledWith(owner, true);
    const [entry] = await listAuditLogs({ action: "admin.user_" }, k);
    expect(entry).toMatchObject({ action: "admin.user_suspended", actorType: "platform_admin" });
  });
});

describe("organization audit log", () => {
  it("is hidden by RLS on plans without the feature, even for owners", async () => {
    await recordAudit({ action: "workspace.created", organizationId: org.organizationId, actorId: owner }, k);
    await setPlan(db, org.organizationId, "starter");
    expect(await listOrganizationAudit(await contextFor(db, owner, org.workspaceId), {}, k)).toEqual([]);
  });

  it("shows the organization's history on Pro, including support actions", async () => {
    await setPlan(db, org.organizationId, "pro");
    const entries = await listOrganizationAudit(await contextFor(db, owner, org.workspaceId), {}, k);
    expect(entries.map((e) => e.action)).toEqual(expect.arrayContaining(["workspace.created", "admin.plan_assigned"]));
    expect(entries.find((e) => e.action === "admin.plan_assigned")?.actorType).toBe("platform_admin");
  });
});
