import { NextResponse } from "next/server";
import { billingProvider, WebhookSignatureError } from "@/server/billing";
import { applyBillingEvent } from "@/server/billing/apply";
import { logger } from "@/server/observability/logger";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/security/request";

const MAX_BODY_BYTES = 512 * 1024;

/**
 * Stripe webhook. The signature and timestamp are verified against the raw
 * body before anything is read; each event is applied at most once, and only
 * verified events can change an organization's plan.
 */
export async function POST(request: Request) {
  const provider = billingProvider();
  if (!provider) return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });

  const meta = await requestMeta();
  try {
    await enforceRateLimit("webhook", meta.ipHash);
  } catch {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  let event;
  try {
    event = await provider.verifyWebhook(raw, request.headers.get("stripe-signature"));
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      logger.warn("billing.webhook_rejected", { reason: error.message, ipHash: meta.ipHash });
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }
    logger.error("billing.webhook_verify_failed", { error });
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 500 });
  }

  try {
    const result = await applyBillingEvent(event);
    logger.info("billing.webhook_processed", { eventId: event.id, type: event.type, outcome: result.outcome });
    return NextResponse.json({ received: true, outcome: result.outcome });
  } catch {
    // Already logged and recorded as failed; a non-2xx makes Stripe retry.
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
