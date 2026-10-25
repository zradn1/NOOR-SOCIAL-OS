import "server-only";
import { createHash } from "node:crypto";
import Stripe from "stripe";
import {
  SUBSCRIPTION_STATUSES,
  WebhookSignatureError,
  type BillingEvent,
  type BillingProvider,
  type PaidPlanId,
  type ProviderSubscription,
  type SubscriptionStatus,
} from "./types";

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  prices: Record<PaidPlanId, string | undefined>;
};

/** Signed events older than this are rejected (replay protection). */
const WEBHOOK_TOLERANCE_SECONDS = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));
const orgId = (value: unknown) => (typeof value === "string" && UUID.test(value) ? value : null);
const date = (seconds: number | null | undefined) => (typeof seconds === "number" ? new Date(seconds * 1000) : null);

export function planForPrice(prices: StripeConfig["prices"], priceId: string | null): PaidPlanId | null {
  if (!priceId) return null;
  for (const [plan, id] of Object.entries(prices) as [PaidPlanId, string | undefined][]) {
    if (id && id === priceId) return plan;
  }
  return null;
}

/** Reduces a Stripe subscription to the fields NOOR stores. */
export function toProviderSubscription(sub: Stripe.Subscription, prices: StripeConfig["prices"]): ProviderSubscription {
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const status = (SUBSCRIPTION_STATUSES as readonly string[]).includes(sub.status) ? (sub.status as SubscriptionStatus) : "incomplete";
  return {
    id: sub.id,
    customerId: idOf(sub.customer) ?? "",
    status,
    planId: planForPrice(prices, priceId),
    priceId,
    periodStart: date(item?.current_period_start),
    periodEnd: date(item?.current_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    organizationId: orgId(sub.metadata?.organization_id),
  };
}

/**
 * Normalizes a verified Stripe event. Subscription events are re-read from
 * Stripe (`latest`) so the state applied is current even when webhooks arrive
 * out of order.
 */
export async function normalizeStripeEvent(
  event: Stripe.Event,
  rawBody: string,
  prices: StripeConfig["prices"],
  latest?: (subscriptionId: string) => Promise<Stripe.Subscription | null>,
): Promise<BillingEvent> {
  const base = {
    provider: "stripe" as const,
    id: event.id,
    type: event.type,
    createdAt: new Date(event.created * 1000),
    payloadDigest: createHash("sha256").update(rawBody).digest("hex"),
  };
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription") return { ...base, action: { kind: "ignore" } };
      return {
        ...base,
        action: {
          kind: "checkout_completed",
          organizationId: orgId(session.client_reference_id) ?? orgId(session.metadata?.organization_id),
          customerId: idOf(session.customer),
          subscriptionId: idOf(session.subscription),
        },
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const deleted = event.type === "customer.subscription.deleted";
      const fresh = !deleted && latest ? await latest(event.data.object.id) : null;
      return {
        ...base,
        action: { kind: "subscription", deleted, subscription: toProviderSubscription(fresh ?? event.data.object, prices) },
      };
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const details = invoice.parent?.subscription_details;
      return {
        ...base,
        action: { kind: "payment_failed", customerId: idOf(invoice.customer), subscriptionId: idOf(details?.subscription ?? null) },
      };
    }
    default:
      return { ...base, action: { kind: "ignore" } };
  }
}

export function stripeProvider(config: StripeConfig, client = new Stripe(config.secretKey, { maxNetworkRetries: 2, timeout: 20_000 })): BillingProvider {
  return {
    id: "stripe",
    async verifyWebhook(rawBody, signatureHeader) {
      if (!signatureHeader) throw new WebhookSignatureError("Missing Stripe-Signature header");
      let event: Stripe.Event;
      try {
        event = client.webhooks.constructEvent(rawBody, signatureHeader, config.webhookSecret, WEBHOOK_TOLERANCE_SECONDS);
      } catch {
        throw new WebhookSignatureError();
      }
      return normalizeStripeEvent(event, rawBody, config.prices, async (id) => {
        try {
          return await client.subscriptions.retrieve(id);
        } catch (error) {
          // A deleted or inaccessible subscription: fall back to the signed payload.
          if (error instanceof Stripe.errors.StripeInvalidRequestError) return null;
          throw error;
        }
      });
    },
    async createCheckoutSession(input) {
      const price = config.prices[input.planId];
      if (!price) throw new Error(`No Stripe price configured for plan ${input.planId}`);
      const session = await client.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        client_reference_id: input.organizationId,
        metadata: { organization_id: input.organizationId, plan_id: input.planId },
        subscription_data: { metadata: { organization_id: input.organizationId } },
        ...(input.customerId ? { customer: input.customerId } : input.customerEmail ? { customer_email: input.customerEmail } : {}),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        allow_promotion_codes: true,
      });
      if (!session.url) throw new Error("Stripe returned a checkout session without a URL");
      return { url: session.url };
    },
    async createPortalSession(input) {
      const session = await client.billingPortal.sessions.create({ customer: input.customerId, return_url: input.returnUrl });
      return { url: session.url };
    },
  };
}
