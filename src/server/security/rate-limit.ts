import "server-only";
import { sql } from "kysely";
import { getDb } from "@/server/db/client";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";

export const RATE_LIMITS = {
  signIn: { windowSeconds: 300, max: 10 },
  signUp: { windowSeconds: 3600, max: 5 },
  passwordReset: { windowSeconds: 3600, max: 5 },
  oauthStart: { windowSeconds: 600, max: 20 },
  aiGenerate: { windowSeconds: 60, max: 12 },
  invitation: { windowSeconds: 3600, max: 30 },
  cron: { windowSeconds: 60, max: 30 },
  webhook: { windowSeconds: 60, max: 300 },
  billing: { windowSeconds: 600, max: 10 },
  adminAction: { windowSeconds: 60, max: 30 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/** Throws RATE_LIMITED when `identifier` exceeded the named limit. */
export async function enforceRateLimit(name: RateLimitName, identifier: string) {
  const { windowSeconds } = RATE_LIMITS[name];
  const max = RATE_LIMITS[name].max * env().RATE_LIMIT_MULTIPLIER;
  const key = `${name}:${identifier}`.slice(0, 200);
  const { rows } = await sql<{ ok: boolean }>`select app.rate_limit_hit(${key}, ${windowSeconds}, ${max}) as ok`.execute(
    getDb(),
  );
  if (!rows[0]?.ok) {
    throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.");
  }
}
