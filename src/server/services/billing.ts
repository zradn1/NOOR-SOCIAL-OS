import "server-only";
import { billingProvider, billingStatus, type PaidPlanId, type SubscriptionStatus } from "@/server/billing";
import { assertCan, type WorkspaceContext } from "@/server/auth/guard";
import { getDb, withSystem, withUser } from "@/server/db/client";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { recordAudit } from "./audit";
import { usageSummary } from "./plan-limits";

type Meta = { ipHash?: string | null; userAgent?: string | null };

export type PlanSummary = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  limits: Record<string, number | null>;
  features: string[];
};

export type SubscriptionSummary = {
  planId: string;
  status: SubscriptionStatus;
  provider: "none" | "stripe" | "manual";
  hasCustomer: boolean;
  hasSubscription: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  lastEventAt: string | null;
};

export type BillingEventSummary = { id: string; type: string; outcome: string | null; receivedAt: string; error: string | null };

const PAID: PaidPlanId[] = ["starter", "pro", "agency"];
const LIVE_STATUSES: SubscriptionStatus[] = ["active", "trialing", "past_due"];

export async function getBillingOverview(ctx: WorkspaceContext, db = getDb()) {
  assertCan(ctx, "org.billing.view");
  const [plans, subscription, usage, events] = await Promise.all([
    withUser(ctx.identity, (trx) => trx.selectFrom("subscription_plans").selectAll().orderBy("sort_order").execute(), db),
    withUser(ctx.identity, (trx) => trx.selectFrom("subscriptions").selectAll().where("organization_id", "=", ctx.organization.id).executeTakeFirst(), db),
    usageSummary(ctx.organization.id, db),
    // billing_events has no API grants; read through the system connection after the permission check.
    withSystem(
      (trx) =>
        trx
          .selectFrom("billing_events")
          .select(["id", "type", "outcome", "received_at", "error"])
          .where("organization_id", "=", ctx.organization.id)
          .orderBy("received_at", "desc")
          .limit(10)
          .execute(),
      db,
    ),
  ]);
  if (!subscription) throw new AppError("NOT_FOUND", "This organization has no subscription record.");
  return {
    plans: plans.map(
      (p): PlanSummary => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.price_cents,
        currency: p.currency,
        limits: p.limits as Record<string, number | null>,
        features: p.features,
      }),
    ),
    subscription: {
      planId: subscription.plan_id,
      status: subscription.status,
      provider: subscription.provider as SubscriptionSummary["provider"],
      hasCustomer: Boolean(subscription.provider_customer_id),
      hasSubscription: Boolean(subscription.provider_subscription_id) && LIVE_STATUSES.includes(subscription.status),
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end).toISOString() : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      lastEventAt: subscription.last_event_at ? new Date(subscription.last_event_at).toISOString() : null,
    } satisfies SubscriptionSummary,
    usage,
    events: events.map(
      (e): BillingEventSummary => ({
        id: e.id,
        type: e.type,
        outcome: e.outcome,
        receivedAt: new Date(e.received_at).toISOString(),
        error: e.error,
      }),
    ),
    status: billingStatus(),
  };
}

function billingUrl(ctx: WorkspaceContext, query = "") {
  return `${env().NEXT_PUBLIC_APP_URL}/w/${ctx.workspace.slug}/billing${query}`;
}

/**
 * Starts a Stripe Checkout session for a paid plan. Nothing changes here: the
 * plan is updated only when Stripe's signed webhook confirms the subscription.
 */
export async function startCheckout(ctx: WorkspaceContext, planId: string, meta: Meta = {}, db = getDb()) {
  assertCan(ctx, "org.billing.manage");
  const provider = billingProvider();
  if (!provider) throw new AppError("NOT_CONFIGURED", "Online payments aren't configured for this deployment.");
  if (!PAID.includes(planId as PaidPlanId)) throw new AppError("VALIDATION", "Choose a paid plan.");
  const status = billingStatus();
  if (status.mode !== "stripe" || !status.pricesConfigured[planId as PaidPlanId]) {
    throw new AppError("NOT_CONFIGURED", "That plan isn't available for online checkout yet.");
  }
  const sub = await withSystem(
    (trx) =>
      trx
        .selectFrom("subscriptions")
        .select(["provider", "provider_customer_id", "provider_subscription_id", "status"])
        .where("organization_id", "=", ctx.organization.id)
        .executeTakeFirstOrThrow(),
    db,
  );
  if (sub.provider === "stripe" && sub.provider_subscription_id && LIVE_STATUSES.includes(sub.status)) {
    throw new AppError("CONFLICT", "You already have a subscription. Change plans from the billing portal.");
  }
  if (sub.provider === "manual") {
    throw new AppError("CONFLICT", "This organization's plan is managed by Noor Studio. Contact support to change it.");
  }
  const session = await provider.createCheckoutSession({
    organizationId: ctx.organization.id,
    planId: planId as PaidPlanId,
    customerId: sub.provider_customer_id,
    customerEmail: sub.provider_customer_id ? null : ctx.user.email,
    successUrl: billingUrl(ctx, "?checkout=submitted"),
    cancelUrl: billingUrl(ctx, "?checkout=cancelled"),
  });
  await recordAudit(
    {
      action: "billing.checkout_started",
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      metadata: { plan: planId },
      ...meta,
    },
    db,
  );
  return { url: session.url };
}

/** Opens Stripe's customer portal for payment methods, invoices, and plan changes. */
export async function openBillingPortal(ctx: WorkspaceContext, db = getDb()) {
  assertCan(ctx, "org.billing.manage");
  const provider = billingProvider();
  if (!provider) throw new AppError("NOT_CONFIGURED", "Online payments aren't configured for this deployment.");
  const sub = await withSystem(
    (trx) => trx.selectFrom("subscriptions").select("provider_customer_id").where("organization_id", "=", ctx.organization.id).executeTakeFirstOrThrow(),
    db,
  );
  if (!sub.provider_customer_id) throw new AppError("VALIDATION", "There's no billing account yet. Choose a plan first.");
  return provider.createPortalSession({ customerId: sub.provider_customer_id, returnUrl: billingUrl(ctx) });
}
