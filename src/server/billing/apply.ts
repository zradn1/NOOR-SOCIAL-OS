import "server-only";
import { sql } from "kysely";
import { getDb, withSystem, type Tx } from "@/server/db/client";
import { logger } from "@/server/observability/logger";
import { recordAudit } from "@/server/services/audit";
import { notify } from "@/server/services/notifications";
import type { BillingEvent } from "./types";

export type ApplyOutcome =
  | { outcome: "applied"; organizationId: string }
  | { outcome: "ignored"; reason: string; organizationId?: string | null }
  | { outcome: "duplicate" };

const PLAN_NAME: Record<string, string> = { free: "Free", starter: "Starter", pro: "Pro", agency: "Agency" };

/**
 * Applies a verified billing event exactly once. The event row is locked for
 * the duration, so concurrent deliveries of the same event serialize; events
 * older than the last one applied to a subscription are ignored. This is the
 * only code path that changes a paid plan.
 */
export async function applyBillingEvent(event: BillingEvent, db = getDb()): Promise<ApplyOutcome> {
  try {
    return await withSystem(async (trx) => {
      await trx
        .insertInto("billing_events")
        .values({
          provider: event.provider,
          provider_event_id: event.id,
          type: event.type,
          payload_digest: event.payloadDigest,
          event_created_at: event.createdAt,
        })
        .onConflict((oc) => oc.columns(["provider", "provider_event_id"]).doNothing())
        .execute();
      const row = await trx
        .selectFrom("billing_events")
        .select(["id", "outcome"])
        .where("provider", "=", event.provider)
        .where("provider_event_id", "=", event.id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (row.outcome === "applied" || row.outcome === "ignored") return { outcome: "duplicate" as const };

      const result = await apply(trx, event);
      await trx
        .updateTable("billing_events")
        .set({
          processed_at: new Date(),
          outcome: result.outcome,
          organization_id: result.outcome === "applied" ? result.organizationId : (result.organizationId ?? null),
          error: result.outcome === "ignored" ? result.reason.slice(0, 500) : null,
        })
        .where("id", "=", row.id)
        .execute();
      return result;
    }, db);
  } catch (error) {
    // Record the failure outside the rolled-back transaction; the provider
    // retries delivery and the event is processed again.
    logger.error("billing.event_failed", { eventId: event.id, type: event.type, error });
    await db
      .insertInto("billing_events")
      .values({
        provider: event.provider,
        provider_event_id: event.id,
        type: event.type,
        payload_digest: event.payloadDigest,
        event_created_at: event.createdAt,
        outcome: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : "unknown error",
      })
      .onConflict((oc) =>
        oc.columns(["provider", "provider_event_id"]).doUpdateSet({ outcome: "failed", error: sql`excluded.error` }),
      )
      .execute()
      .catch(() => {});
    throw error;
  }
}

async function organizationFor(trx: Tx, organizationId: string | null, customerId: string | null) {
  if (organizationId) {
    const org = await trx
      .selectFrom("subscriptions")
      .select(["organization_id", "provider_customer_id"])
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();
    if (org) {
      // An organization already linked to a different customer is never re-linked by an event.
      if (customerId && org.provider_customer_id && org.provider_customer_id !== customerId) return null;
      return org.organization_id;
    }
  }
  if (customerId) {
    const byCustomer = await trx
      .selectFrom("subscriptions")
      .select("organization_id")
      .where("provider_customer_id", "=", customerId)
      .executeTakeFirst();
    if (byCustomer) return byCustomer.organization_id;
  }
  return null;
}

async function billingLink(trx: Tx, organizationId: string) {
  const ws = await trx
    .selectFrom("workspaces")
    .select("slug")
    .where("organization_id", "=", organizationId)
    .where("deleted_at", "is", null)
    .where("is_demo", "=", false)
    .orderBy("created_at")
    .executeTakeFirst();
  return ws ? `/w/${ws.slug}/billing` : null;
}

async function notifyOrganizationAdmins(
  trx: Tx,
  organizationId: string,
  n: { kind: string; severity: "info" | "success" | "warning" | "error"; title: string; body: string },
) {
  const link = await billingLink(trx, organizationId);
  const admins = await trx
    .selectFrom("organization_members")
    .select("user_id")
    .where("organization_id", "=", organizationId)
    .where("role", "in", ["owner", "admin"])
    .execute();
  for (const a of admins) await notify(trx, { ...n, userId: a.user_id, organizationId, link });
}

async function apply(trx: Tx, event: BillingEvent): Promise<Exclude<ApplyOutcome, { outcome: "duplicate" }>> {
  const action = event.action;
  switch (action.kind) {
    case "ignore":
      return { outcome: "ignored", reason: "event type not handled" };

    case "checkout_completed": {
      const organizationId = await organizationFor(trx, action.organizationId, action.customerId);
      if (!organizationId || !action.customerId) return { outcome: "ignored", reason: "no matching organization" };
      // Link the customer only. The plan changes when the subscription event confirms it.
      await trx
        .updateTable("subscriptions")
        .set({ provider_customer_id: action.customerId })
        .where("organization_id", "=", organizationId)
        .where("provider_customer_id", "is", null)
        .execute();
      return { outcome: "applied", organizationId };
    }

    case "payment_failed": {
      const organizationId = await organizationFor(trx, null, action.customerId);
      if (!organizationId) return { outcome: "ignored", reason: "no matching organization" };
      await notifyOrganizationAdmins(trx, organizationId, {
        kind: "billing.payment_failed",
        severity: "error",
        title: "A payment failed",
        body: "Stripe couldn't collect the latest payment. Update the payment method to keep your plan.",
      });
      await recordAudit(
        { action: "billing.payment_failed", organizationId, actorType: "system", metadata: { event: event.id } },
        trx,
      );
      return { outcome: "applied", organizationId };
    }

    case "subscription": {
      const s = action.subscription;
      const organizationId = await organizationFor(trx, s.organizationId, s.customerId);
      if (!organizationId) return { outcome: "ignored", reason: "no matching organization" };
      const current = await trx
        .selectFrom("subscriptions")
        .selectAll()
        .where("organization_id", "=", organizationId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      if (current.provider_subscription_id && current.provider_subscription_id !== s.id && current.status !== "canceled" && !action.deleted) {
        return { outcome: "ignored", reason: "organization already has another active subscription", organizationId };
      }
      if (action.deleted && current.provider_subscription_id && current.provider_subscription_id !== s.id) {
        return { outcome: "ignored", reason: "deleted subscription is not the current one", organizationId };
      }
      if (current.last_event_at && event.createdAt < new Date(current.last_event_at)) {
        return { outcome: "ignored", reason: "older than the last applied event", organizationId };
      }
      const ended = action.deleted || s.status === "canceled" || s.status === "incomplete_expired";
      if (!ended && !s.planId) {
        // A price we don't recognize: never guess a plan.
        throw new Error(`Unknown price ${s.priceId ?? "(none)"} on subscription ${s.id}`);
      }
      const planId = ended ? "free" : s.planId!;
      const status = action.deleted ? "canceled" : s.status;

      await trx
        .updateTable("subscriptions")
        .set({
          plan_id: planId,
          status,
          provider: "stripe",
          provider_customer_id: s.customerId,
          provider_subscription_id: s.id,
          current_period_start: s.periodStart,
          current_period_end: s.periodEnd,
          cancel_at_period_end: s.cancelAtPeriodEnd,
          pending_plan_id: null,
          last_event_at: event.createdAt,
        })
        .where("organization_id", "=", organizationId)
        .execute();

      const planChanged = current.plan_id !== planId;
      const statusChanged = current.status !== status;
      if (planChanged || statusChanged) {
        await recordAudit(
          {
            action: "billing.subscription_changed",
            organizationId,
            actorType: "system",
            targetType: "subscription",
            targetId: current.id,
            metadata: { from: { plan: current.plan_id, status: current.status }, to: { plan: planId, status }, event: event.id },
          },
          trx,
        );
        const name = PLAN_NAME[planId] ?? planId;
        // Only active or trialing counts as confirmed; incomplete means the payment hasn't cleared.
        const message = ended
          ? { kind: "billing.subscription_ended", severity: "warning" as const, title: "Subscription ended", body: "Your organization is now on the Free plan." }
          : status === "past_due" || status === "unpaid"
            ? { kind: "billing.past_due", severity: "warning" as const, title: "Payment overdue", body: `Your ${name} plan has an unpaid invoice.` }
            : status === "active" || status === "trialing"
              ? { kind: "billing.plan_confirmed", severity: "success" as const, title: `${name} plan confirmed`, body: "Stripe confirmed the subscription. New limits apply now." }
              : null;
        if (message) await notifyOrganizationAdmins(trx, organizationId, message);
      }
      return { outcome: "applied", organizationId };
    }
  }
}
