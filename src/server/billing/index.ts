import "server-only";
import { env } from "@/server/env";
import { stripeProvider } from "./stripe";
import type { BillingProvider, PaidPlanId } from "./types";

export type BillingStatus =
  | { mode: "stripe"; pricesConfigured: Record<PaidPlanId, boolean> }
  | { mode: "none"; reason: "disabled" | "missing_keys"; missing: string[] };

export function billingStatus(): BillingStatus {
  const e = env();
  if (e.BILLING_PROVIDER !== "stripe") return { mode: "none", reason: "disabled", missing: [] };
  const missing = [
    ["STRIPE_SECRET_KEY", e.STRIPE_SECRET_KEY],
    ["STRIPE_WEBHOOK_SECRET", e.STRIPE_WEBHOOK_SECRET],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k as string);
  if (missing.length) return { mode: "none", reason: "missing_keys", missing };
  return {
    mode: "stripe",
    pricesConfigured: { starter: Boolean(e.STRIPE_PRICE_STARTER), pro: Boolean(e.STRIPE_PRICE_PRO), agency: Boolean(e.STRIPE_PRICE_AGENCY) },
  };
}

let cached: { key: string; provider: BillingProvider } | null = null;

/** The configured provider, or null when billing is off. Secrets stay on the server. */
export function billingProvider(): BillingProvider | null {
  if (billingStatus().mode !== "stripe") return null;
  const e = env();
  const key = `${e.STRIPE_SECRET_KEY}:${e.STRIPE_WEBHOOK_SECRET}`;
  if (cached?.key !== key) {
    cached = {
      key,
      provider: stripeProvider({
        secretKey: e.STRIPE_SECRET_KEY!,
        webhookSecret: e.STRIPE_WEBHOOK_SECRET!,
        prices: { starter: e.STRIPE_PRICE_STARTER, pro: e.STRIPE_PRICE_PRO, agency: e.STRIPE_PRICE_AGENCY },
      }),
    };
  }
  return cached.provider;
}

export * from "./types";
