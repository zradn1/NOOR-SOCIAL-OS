export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type PaidPlanId = "starter" | "pro" | "agency";

/** Subscription state as the provider reports it, independent of the provider's wire format. */
export type ProviderSubscription = {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  /** Our plan id for the subscribed price, or null when the price isn't one of ours. */
  planId: PaidPlanId | null;
  priceId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** organization_id we attached to the subscription at checkout. */
  organizationId: string | null;
};

/**
 * A verified provider event, reduced to what NOOR acts on. Produced only after
 * the webhook signature has been checked.
 */
export type BillingEvent = {
  provider: "stripe";
  id: string;
  type: string;
  createdAt: Date;
  /** SHA-256 of the raw payload; the payload itself is not stored. */
  payloadDigest: string;
  action:
    | { kind: "checkout_completed"; organizationId: string | null; customerId: string | null; subscriptionId: string | null }
    | { kind: "subscription"; subscription: ProviderSubscription; deleted: boolean }
    | { kind: "payment_failed"; customerId: string | null; subscriptionId: string | null }
    | { kind: "ignore" };
};

export interface BillingProvider {
  id: "stripe";
  /** Verifies the signature and timestamp, then normalizes. Throws WebhookSignatureError. */
  verifyWebhook(rawBody: string, signatureHeader: string | null): Promise<BillingEvent>;
  createCheckoutSession(input: {
    organizationId: string;
    planId: PaidPlanId;
    customerId: string | null;
    customerEmail: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
}

export class WebhookSignatureError extends Error {
  constructor(message = "Invalid webhook signature") {
    super(message);
    this.name = "WebhookSignatureError";
  }
}
