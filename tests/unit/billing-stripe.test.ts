import { createHash } from "node:crypto";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { planForPrice, stripeProvider } from "@/server/billing/stripe";
import { WebhookSignatureError } from "@/server/billing/types";

const SECRET = "whsec_test_secret";
const prices = { starter: "price_starter", pro: "price_pro", agency: "price_agency" };
const ORG = "6f1c1f3e-1d2b-4c5a-9e8f-0123456789ab";

// A real SDK client (no network for signature checks); subscription reads are stubbed per test.
function setup(retrieve: (id: string) => Promise<unknown> = async () => {
  throw new Error("unexpected network call");
}) {
  const client = new Stripe("sk_test_unit", { maxNetworkRetries: 0 });
  (client.subscriptions as unknown as { retrieve: unknown }).retrieve = vi.fn(retrieve);
  const provider = stripeProvider({ secretKey: "sk_test_unit", webhookSecret: SECRET, prices }, client);
  const sign = (payload: string, opts: { secret?: string; timestamp?: number } = {}) =>
    client.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET, timestamp: opts.timestamp });
  return { client, provider, sign };
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    metadata: { organization_id: ORG },
    items: { data: [{ price: { id: "price_pro" }, current_period_start: 1_790_000_000, current_period_end: 1_792_592_000 }] },
    ...overrides,
  };
}

function event(type: string, object: unknown, created = Math.floor(Date.now() / 1000)) {
  return JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, object: "event", type, created, data: { object } });
}

describe("Stripe webhook verification", () => {
  it("accepts a correctly signed payload and fingerprints it", async () => {
    const { provider, sign } = setup();
    const body = event("checkout.session.completed", { id: "cs_1", object: "checkout.session", mode: "subscription", client_reference_id: ORG, customer: "cus_1", subscription: "sub_1", metadata: {} });
    const result = await provider.verifyWebhook(body, sign(body));
    expect(result.payloadDigest).toBe(createHash("sha256").update(body).digest("hex"));
    expect(result.action).toEqual({ kind: "checkout_completed", organizationId: ORG, customerId: "cus_1", subscriptionId: "sub_1" });
  });

  it("rejects a missing header, a wrong secret, and a tampered body", async () => {
    const { provider, sign } = setup();
    const body = event("invoice.paid", { id: "in_1", object: "invoice" });
    await expect(provider.verifyWebhook(body, null)).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(provider.verifyWebhook(body, sign(body, { secret: "whsec_other" }))).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(provider.verifyWebhook(body.replace("invoice.paid", "invoice.payment_failed"), sign(body))).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("rejects replays outside the five-minute tolerance", async () => {
    const { provider, sign } = setup();
    const body = event("invoice.paid", { id: "in_1", object: "invoice" });
    const old = Math.floor(Date.now() / 1000) - 600;
    await expect(provider.verifyWebhook(body, sign(body, { timestamp: old }))).rejects.toBeInstanceOf(WebhookSignatureError);
  });
});

describe("Stripe event normalization", () => {
  it("re-reads subscriptions so out-of-order deliveries apply the current state", async () => {
    const { provider, sign, client } = setup(async () => subscription({ status: "active" }));
    const body = event("customer.subscription.created", subscription({ status: "incomplete" }));
    const result = await provider.verifyWebhook(body, sign(body));
    expect(client.subscriptions.retrieve).toHaveBeenCalledWith("sub_1");
    expect(result.action).toMatchObject({
      kind: "subscription",
      deleted: false,
      subscription: { id: "sub_1", customerId: "cus_1", status: "active", planId: "pro", organizationId: ORG, cancelAtPeriodEnd: false },
    });
    if (result.action.kind === "subscription") {
      expect(result.action.subscription.periodEnd?.toISOString()).toBe(new Date(1_792_592_000_000).toISOString());
    }
  });

  it("uses the signed payload for deletions and maps unknown prices to no plan", async () => {
    const { provider, sign, client } = setup();
    const body = event("customer.subscription.deleted", subscription({ status: "canceled", items: { data: [{ price: { id: "price_someone_else" } }] } }));
    const result = await provider.verifyWebhook(body, sign(body));
    expect(client.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(result.action).toMatchObject({ kind: "subscription", deleted: true, subscription: { planId: null, status: "canceled" } });
  });

  it("ignores one-off payments and unhandled types; flags failed invoices", async () => {
    const { provider, sign } = setup();
    const payment = event("checkout.session.completed", { id: "cs_2", object: "checkout.session", mode: "payment", customer: "cus_1" });
    expect((await provider.verifyWebhook(payment, sign(payment))).action).toEqual({ kind: "ignore" });
    const other = event("customer.created", { id: "cus_9", object: "customer" });
    expect((await provider.verifyWebhook(other, sign(other))).action).toEqual({ kind: "ignore" });
    const failed = event("invoice.payment_failed", { id: "in_2", object: "invoice", customer: "cus_1", parent: { type: "subscription_details", subscription_details: { subscription: "sub_1", metadata: {} } } });
    expect((await provider.verifyWebhook(failed, sign(failed))).action).toEqual({ kind: "payment_failed", customerId: "cus_1", subscriptionId: "sub_1" });
  });

  it("never trusts a malformed organization id from metadata", async () => {
    const { provider, sign } = setup();
    const body = event("checkout.session.completed", { id: "cs_3", object: "checkout.session", mode: "subscription", client_reference_id: "'; drop table x; --", customer: "cus_1", subscription: null, metadata: {} });
    expect((await provider.verifyWebhook(body, sign(body))).action).toMatchObject({ organizationId: null });
  });

  it("maps configured prices to plans", () => {
    expect(planForPrice(prices, "price_agency")).toBe("agency");
    expect(planForPrice(prices, "price_unknown")).toBeNull();
    expect(planForPrice({ starter: undefined, pro: undefined, agency: undefined }, "price_pro")).toBeNull();
  });
});
