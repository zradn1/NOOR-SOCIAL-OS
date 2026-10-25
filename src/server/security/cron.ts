import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

/**
 * Authenticates scheduler requests (Vercel Cron, Supabase pg_cron + pg_net,
 * GitHub Actions…) with `Authorization: Bearer <CRON_SECRET>`.
 */
export function verifyCronRequest(request: Request): "ok" | "unauthorized" | "not_configured" {
  const secret = env().CRON_SECRET;
  if (!secret) return "not_configured";
  const header = request.headers.get("authorization") ?? "";
  const provided = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected) ? "ok" : "unauthorized";
}
