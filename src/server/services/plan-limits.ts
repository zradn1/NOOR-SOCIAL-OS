import "server-only";
import { sql } from "kysely";
import type { Executor, Tx } from "@/server/db/client";
import { getDb } from "@/server/db/client";
import { limitExceeded } from "@/server/errors";

export const LIMIT_KEYS = [
  "workspaces",
  "social_accounts",
  "members",
  "scheduled_posts_per_month",
  "ai_generations_per_month",
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** Current non-demo usage counted against a plan limit. */
export async function currentUsage(executor: Executor, organizationId: string, key: LimitKey): Promise<number> {
  switch (key) {
    case "workspaces": {
      const r = await executor
        .selectFrom("workspaces")
        .select((eb) => eb.fn.countAll<number>().as("n"))
        .where("organization_id", "=", organizationId)
        .where("is_demo", "=", false)
        .where("deleted_at", "is", null)
        .executeTakeFirstOrThrow();
      return Number(r.n);
    }
    case "social_accounts": {
      const r = await executor
        .selectFrom("social_accounts")
        .select((eb) => eb.fn.countAll<number>().as("n"))
        .where("organization_id", "=", organizationId)
        .where("is_demo", "=", false)
        .where("deleted_at", "is", null)
        .where("connection_status", "not in", ["disconnected", "revoked"])
        .executeTakeFirstOrThrow();
      return Number(r.n);
    }
    case "members": {
      const { rows } = await sql<{ n: number }>`
        select (select count(*) from public.organization_members where organization_id = ${organizationId}::uuid)
             + (select count(*) from public.organization_invitations
                 where organization_id = ${organizationId}::uuid and accepted_at is null and revoked_at is null and expires_at > now()) as n
      `.execute(executor);
      return Number(rows[0]?.n ?? 0);
    }
    case "scheduled_posts_per_month":
    case "ai_generations_per_month": {
      const metric = key === "scheduled_posts_per_month" ? "post_scheduled" : "ai_generation";
      const { rows } = await sql<{ n: number }>`select app.monthly_usage(${organizationId}::uuid, ${metric}::usage_metric) as n`.execute(
        executor,
      );
      return Number(rows[0]?.n ?? 0);
    }
  }
}

export async function planLimit(executor: Executor, organizationId: string, key: LimitKey): Promise<number | null> {
  const { rows } = await sql<{ value: number | null }>`select app.plan_limit(${organizationId}::uuid, ${key}) as value`.execute(executor);
  return rows[0]?.value ?? null;
}

/**
 * Throws LIMIT_EXCEEDED when one more unit would exceed the plan. Call inside
 * the system transaction that performs the write: the subscription row is
 * locked, so concurrent requests are serialized.
 */
export async function assertWithinLimit(trx: Tx, organizationId: string, key: LimitKey) {
  await sql`select app.lock_organization_subscription(${organizationId}::uuid)`.execute(trx);
  const limit = await planLimit(trx, organizationId, key);
  if (limit === null) return;
  if ((await currentUsage(trx, organizationId, key)) >= limit) throw limitExceeded(key);
}

export type UsageLine = { key: LimitKey; used: number; limit: number | null };

export async function usageSummary(organizationId: string, db = getDb()): Promise<UsageLine[]> {
  return Promise.all(
    LIMIT_KEYS.map(async (key) => ({
      key,
      used: await currentUsage(db, organizationId, key),
      limit: await planLimit(db, organizationId, key),
    })),
  );
}

export type PlanFeature = "analytics_import" | "client_workspaces" | "audit_log" | "client_roles";

export async function planHasFeature(organizationId: string, feature: PlanFeature, db: Executor = getDb()): Promise<boolean> {
  const { rows } = await sql<{ ok: boolean }>`select app.plan_has_feature(${organizationId}::uuid, ${feature}) as ok`.execute(db);
  return Boolean(rows[0]?.ok);
}
