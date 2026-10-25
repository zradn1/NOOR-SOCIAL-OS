"use server";

import { z } from "zod";
import { loadWorkspaceForAction } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/security/request";
import { openBillingPortal, startCheckout } from "@/server/services/billing";
import { runAction } from "./run";

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);

/** Returns a Stripe-hosted URL; the browser navigates there. */
export async function startCheckoutAction(slug: string, planId: string) {
  return runAction("billing.checkout", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "org.billing.manage");
    await enforceRateLimit("billing", ctx.user.id);
    return startCheckout(ctx, z.enum(["starter", "pro", "agency"]).parse(planId), await requestMeta());
  });
}

export async function openBillingPortalAction(slug: string) {
  return runAction("billing.portal", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "org.billing.manage");
    await enforceRateLimit("billing", ctx.user.id);
    return openBillingPortal(ctx);
  });
}
