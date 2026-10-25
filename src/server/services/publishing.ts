import "server-only";
import type { Platform } from "@/lib/platforms/registry";
import type { WorkspaceContext } from "@/server/auth/context";
import { getDb, withUser } from "@/server/db/client";

export type JobRow = {
  id: string;
  postId: string;
  postTitle: string;
  platform: Platform;
  accountName: string;
  status: string;
  errorCode: string | null;
  lastError: string | null;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  completedAt: string | null;
  idempotencyKey: string;
};

const FILTERS: Record<string, string[]> = {
  queue: ["pending", "running"],
  problems: ["failed", "blocked"],
  history: ["succeeded", "simulated", "cancelled"],
};

export async function listJobs(ctx: WorkspaceContext, filter: keyof typeof FILTERS, db = getDb()): Promise<JobRow[]> {
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("publishing_jobs as j")
        .innerJoin("post_platform_targets as t", "t.id", "j.target_id")
        .innerJoin("content_posts as p", "p.id", "j.post_id")
        .innerJoin("social_accounts as a", "a.id", "t.social_account_id")
        .select([
          "j.id",
          "j.post_id",
          "p.title",
          "p.caption",
          "t.platform",
          "a.display_name",
          "j.status",
          "j.error_code",
          "j.last_error",
          "j.attempts",
          "j.max_attempts",
          "j.run_at",
          "j.completed_at",
          "j.idempotency_key",
        ])
        .where("j.workspace_id", "=", ctx.workspace.id)
        .where("j.status", "in", FILTERS[filter] as never)
        .orderBy(filter === "queue" ? "j.run_at" : "j.updated_at", filter === "queue" ? "asc" : "desc")
        .limit(200)
        .execute(),
    db,
  );
  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    postTitle: r.title || r.caption.slice(0, 80) || "Untitled post",
    platform: r.platform,
    accountName: r.display_name,
    status: r.status,
    errorCode: r.error_code,
    lastError: r.last_error,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    runAt: r.run_at.toISOString(),
    completedAt: r.completed_at?.toISOString() ?? null,
    idempotencyKey: r.idempotency_key,
  }));
}

export async function jobCounts(ctx: WorkspaceContext, db = getDb()) {
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("publishing_jobs")
        .select(["status", (eb) => eb.fn.countAll<number>().as("n")])
        .where("workspace_id", "=", ctx.workspace.id)
        .groupBy("status")
        .execute(),
    db,
  );
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  return {
    queue: (by.pending ?? 0) + (by.running ?? 0),
    problems: (by.failed ?? 0) + (by.blocked ?? 0),
    history: (by.succeeded ?? 0) + (by.simulated ?? 0) + (by.cancelled ?? 0),
  };
}

/** Last time any worker or cron run processed the queue (operational, not tenant data). */
export async function workerLastSeen(db = getDb()) {
  const row = await db.selectFrom("system_heartbeats").select("last_seen_at").where("component", "=", "publishing-worker").executeTakeFirst();
  return row?.last_seen_at.toISOString() ?? null;
}
