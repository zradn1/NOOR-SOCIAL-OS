import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { env } from "@/server/env";

let devSecret: string | null = null;

function ipSecret() {
  const configured = env().IP_HASH_SECRET;
  if (configured) return configured;
  if (env().NODE_ENV === "production") throw new Error("IP_HASH_SECRET must be set in production");
  devSecret ??= randomBytes(32).toString("hex");
  return devSecret;
}

/** HMAC of a value with the IP hash secret; raw IPs are never stored or logged. */
export function hashIdentifier(value: string) {
  return createHmac("sha256", ipSecret()).update(value).digest("hex");
}

export async function requestMeta() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || "unknown";
  const userAgent = (h.get("user-agent") ?? "").slice(0, 300) || null;
  return { ipHash: hashIdentifier(ip), userAgent };
}
