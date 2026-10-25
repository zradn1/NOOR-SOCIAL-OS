import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyBillingEvent } from "@/server/billing/apply";
import type { BillingEvent, ProviderSubscription } from "@/server/billing/types";
import type { DB } from "@/server/db/schema.generated";
import { toAppError } from "@/server/errors";
import { getBillingOverview, startCheckout } from "@/server/services/billing";
import { planHasFeature } from "@/server/services/plan-limits";
import { addMember, createAuthUser, createOrganization, createTestDb, type OrgFixture, type TestDb } from "../support/db";
import { contextFor, kyselyFor } from "../support/services";

let db: TestDb;
let k: Kysely<DB>;
let owner: string;
let admin: string;
let org: OrgFixture;
let other: OrgFixture;
let clock = Date.parse("2026-10-20T10:00:00Z");

const tick = () => new Date((clock += 60_000));

function subEvent(sub: Partial<ProviderSubscription>, opts: { id?: string; at?: Date; deleted?: boolean; type?: string } = {}): BillingEvent {
  return {
    provider: "stripe",
    id: opts.id ?? `evt_${randomUUID()}`,
    type: opts.type ?? "customer.subscription.updated",
    createdAt: opts.at ?? tick(),
    payloadDigest: "a".repeat(64),
    action: {
      kind: "subscription",
      deleted: opts.deleted ?? false,
      subscription: {
        id: "sub_1",
        customerId: "cus_1",
        status: "active",
        planId: "pro",
        priceId: "price_pro",
        periodStart: new Date("2026-10-20T00:00:00Z"),
        periodEnd: new Date("2026-11-20T00:00:00Z"),
        cancelAtPeriodEnd: false,
        organizationId: org.organizationId,
        ...sub,
      },
    },
  };
}

async function subscription() {
  const { rows } = await db.sys.query(
    "select plan_id, status::text, provider, provider_customer_id, provider_subscription_id from subscriptions where organization_id = $1",
    [org.organizationId],
  );
  return rows[0];
}

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
  owner = await createAuthUser(db.sys, "owner@billing.test");
  admin = await createAuthUser(db.sys, "admin@billing.test");
  org = await createOrganization(db, owner, "Billing Co");
  other = await createOrganization(db, await createAuthUser(db.sys, "x@other.test"), "Other Co");
  await addMember(db, org.organizationId, admin, "admin");
});

afterAll(async () => {
  await k?.destroy();
  await db?.close();
});

describe("applying verified billing events", () => {
  it("links the customer on checkout without changing the plan", async () => {
    const result = await applyBillingEvent(
      {
        provider: "stripe",
        id: "evt_checkout",
        type: "checkout.session.completed",
        createdAt: tick(),
        payloadDigest: "b".repeat(64),
        action: { kind: "checkout_completed", organizationId: org.organizationId, customerId: "cus_1", subscriptionId: "sub_1" },
      },
      k,
    );
    expect(result).toEqual({ outcome: "applied", organizationId: org.organizationId });
    expect(await subscription()).toMatchObject({ plan_id: "free", provider: "none", provider_customer_id: "cus_1" });
  });

  it("changes the plan only when the subscription is confirmed, and records why", async () => {
    await applyBillingEvent(subEvent({ status: "incomplete" }), k);
    expect(await subscription()).toMatchObject({ plan_id: "pro", status: "incomplete" });
    expect(await planHasFeature(org.organizationId, "client_workspaces", k)).toBe(false);

    await applyBillingEvent(subEvent({ status: "active" }, { id: "evt_active" }), k);
    expect(await subscription()).toMatchObject({ plan_id: "pro", status: "active", provider: "stripe", provider_subscription_id: "sub_1" });
    expect(await planHasFeature(org.organizationId, "client_workspaces", k)).toBe(true);

    const audit = await db.sys.query("select metadata from audit_logs where organization_id = $1 and action = 'billing.subscription_changed' order by created_at", [org.organizationId]);
    expect(audit.rows.at(-1).metadata).toMatchObject({ to: { plan: "pro", status: "active" }, event: "evt_active" });
    const notes = await db.sys.query("select user_id, kind from notifications where organization_id = $1 and kind = 'billing.plan_confirmed'", [org.organizationId]);
    expect(notes.rows.map((r) => r.user_id).sort()).toEqual([owner, admin].sort());
  });

  it("applies each event once", async () => {
    const before = await db.sys.query("select count(*)::int as n from audit_logs where organization_id = $1", [org.organizationId]);
    expect(await applyBillingEvent(subEvent({ status: "active" }, { id: "evt_active" }), k)).toEqual({ outcome: "duplicate" });
    const after = await db.sys.query("select count(*)::int as n from audit_logs where organization_id = $1", [org.organizationId]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("ignores events older than the last one applied", async () => {
    const stale = subEvent({ status: "past_due" }, { at: new Date("2026-01-01T00:00:00Z") });
    expect(await applyBillingEvent(stale, k)).toMatchObject({ outcome: "ignored", reason: "older than the last applied event" });
    expect(await subscription()).toMatchObject({ status: "active" });
  });

  it("never guesses a plan for an unknown price; a fixed retry then succeeds", async () => {
    const bad = subEvent({ planId: null, priceId: "price_mystery", status: "active" }, { id: "evt_unknown_price" });
    await expect(applyBillingEvent(bad, k)).rejects.toThrow(/Unknown price/);
    const { rows } = await db.sys.query("select outcome from billing_events where provider_event_id = 'evt_unknown_price'");
    expect(rows[0].outcome).toBe("failed");
    expect(await subscription()).toMatchObject({ plan_id: "pro" });
    // Same event delivered again after the price is configured.
    const fixed = subEvent({ planId: "agency", priceId: "price_agency" }, { id: "evt_unknown_price" });
    expect(await applyBillingEvent(fixed, k)).toMatchObject({ outcome: "applied" });
    expect(await subscription()).toMatchObject({ plan_id: "agency" });
  });

  it("won't let an event re-link an organization to another customer", async () => {
    const hijack = subEvent({ id: "sub_evil", customerId: "cus_evil", organizationId: org.organizationId });
    expect(await applyBillingEvent(hijack, k)).toMatchObject({ outcome: "ignored", reason: "no matching organization" });
    expect(await subscription()).toMatchObject({ provider_customer_id: "cus_1", provider_subscription_id: "sub_1" });
  });

  it("ignores events for organizations it can't match", async () => {
    const stray = subEvent({ id: "sub_x", customerId: "cus_unknown", organizationId: null });
    expect(await applyBillingEvent(stray, k)).toMatchObject({ outcome: "ignored" });
    const { rows } = await db.sys.query("select plan_id from subscriptions where organization_id = $1", [other.organizationId]);
    expect(rows[0].plan_id).toBe("free");
  });

  it("notifies admins when a payment fails", async () => {
    await applyBillingEvent(
      { provider: "stripe", id: "evt_fail", type: "invoice.payment_failed", createdAt: tick(), payloadDigest: "c".repeat(64), action: { kind: "payment_failed", customerId: "cus_1", subscriptionId: "sub_1" } },
      k,
    );
    const { rows } = await db.sys.query("select count(*)::int as n from notifications where organization_id = $1 and kind = 'billing.payment_failed'", [org.organizationId]);
    expect(rows[0].n).toBe(2);
  });

  it("returns to Free when the subscription ends", async () => {
    await applyBillingEvent(subEvent({ status: "canceled" }, { deleted: true, type: "customer.subscription.deleted" }), k);
    expect(await subscription()).toMatchObject({ plan_id: "free", status: "canceled", provider: "stripe" });
    expect(await planHasFeature(org.organizationId, "analytics_import", k)).toBe(false);
  });
});

describe("billing service", () => {
  it("is visible to admins but not to editors", async () => {
    const editor = await createAuthUser(db.sys, "editor@billing.test");
    await addMember(db, org.organizationId, editor, "editor");
    await db.sys.query("insert into workspace_members (workspace_id, organization_id, user_id, role) values ($1, $2, $3, 'editor')", [org.workspaceId, org.organizationId, editor]);
    expect((await errorOf(getBillingOverview(await contextFor(db, editor, org.workspaceId), k))).code).toBe("FORBIDDEN");
    const overview = await getBillingOverview(await contextFor(db, admin, org.workspaceId), k);
    expect(overview.plans.map((p) => p.id)).toEqual(["free", "starter", "pro", "agency"]);
    expect(overview.events.length).toBeGreaterThan(0);
  });

  it("only owners can start checkout, and only when a provider is configured", async () => {
    expect((await errorOf(startCheckout(await contextFor(db, admin, org.workspaceId), "pro", {}, k))).code).toBe("FORBIDDEN");
    expect((await errorOf(startCheckout(await contextFor(db, owner, org.workspaceId), "pro", {}, k))).code).toBe("NOT_CONFIGURED");
  });
});
