import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { logger } from "@/server/observability/logger";
import { runMaintenance } from "@/server/publishing/maintenance";
import { productionWorkerDeps } from "@/server/publishing/runtime";
import { runPublishingBatch } from "@/server/publishing/worker";
import { verifyCronRequest } from "@/server/security/cron";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/security/request";

/**
 * Runs one bounded batch of due publishing jobs plus housekeeping. Intended
 * for a managed scheduler calling every minute. Overlapping invocations are
 * safe: jobs are claimed with FOR UPDATE SKIP LOCKED.
 */
async function handle(request: Request) {
  try {
    await enforceRateLimit("cron", (await requestMeta()).ipHash);
  } catch {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const auth = verifyCronRequest(request);
  if (auth === "not_configured") return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (auth !== "ok") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const deps = productionWorkerDeps();
  try {
    const batch = await runPublishingBatch({ workerId: `cron-${randomUUID().slice(0, 8)}`, limit: 25, ...deps });
    const maintenance = await runMaintenance({ keyRing: deps.keyRing! });
    return NextResponse.json({ ok: true, batch, maintenance });
  } catch (error) {
    logger.error("cron.publishing_failed", { error });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
