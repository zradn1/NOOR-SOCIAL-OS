import "server-only";
import { sql, type Kysely, type Selectable } from "kysely";
import { composeCaption, validateForPlatform } from "@/lib/platforms/constraints";
import { PLATFORM_META, type Platform } from "@/lib/platforms/registry";
import { getDb, withSystem, type Executor } from "@/server/db/client";
import type { DB, PublishingJobs } from "@/server/db/schema.generated";
import { simulatePublish } from "@/server/integrations/demo";
import { defaultRegistry, type ProviderRegistry } from "@/server/integrations/registry";
import { decryptSecret, type KeyRing } from "@/server/integrations/token-crypto";
import type { PublishRequest, PublishResult } from "@/server/integrations/types";
import { logger } from "@/server/observability/logger";
import { notifyWorkspaceAdmins } from "@/server/services/notifications";
import { BlockedError, decide, PermanentError, type AttemptDecision } from "./outcome";

export type WorkerDeps = {
  db?: Kysely<DB>;
  registry?: ProviderRegistry;
  /** Lazily loaded: demo workspaces never need encryption keys. */
  keyRing?: () => KeyRing;
  /** Turns a storage path into a URL the platform can fetch. */
  storageUrl?: (bucket: string, path: string) => Promise<string>;
  random?: () => number;
  now?: () => Date;
};

type Job = Selectable<PublishingJobs>;
type Outcome = { kind: "succeeded"; result: PublishResult } | { kind: "simulated"; note: string } | AttemptDecision;

const ACCOUNT_BLOCK_REASONS: Record<string, string> = {
  manual: "This account is tracked manually and isn't connected, so it can't publish.",
  pending: "The account's authorization was never completed.",
  expired: "The account's access expired. Reconnect it to publish.",
  revoked: "Access to this account was revoked on the platform.",
  error: "The account is in an error state. Reconnect it to publish.",
  disconnected: "The account was disconnected.",
};

/** Builds the provider request, or throws Blocked/Permanent errors. */
async function prepare(db: Kysely<DB>, job: Job, deps: Required<Pick<WorkerDeps, "registry">> & WorkerDeps) {
  const target = await db
    .selectFrom("post_platform_targets as t")
    .innerJoin("content_posts as p", "p.id", "t.post_id")
    .innerJoin("social_accounts as a", "a.id", "t.social_account_id")
    .select([
      "t.id",
      "t.platform",
      "t.caption_override",
      "t.settings",
      "p.title",
      "p.caption",
      "p.hashtags",
      "p.first_comment",
      "p.link_url",
      "p.deleted_at as post_deleted_at",
      "p.status as post_status",
      "a.id as account_id",
      "a.connection_status",
      "a.external_account_id",
      "a.deleted_at as account_deleted_at",
    ])
    .where("t.id", "=", job.target_id)
    .executeTakeFirst();
  if (!target || target.post_deleted_at || target.post_status === "archived") {
    throw new BlockedError("post_unavailable", "The post was deleted or archived.");
  }
  const media = await db
    .selectFrom("post_media as pm")
    .innerJoin("media_assets as m", "m.id", "pm.media_asset_id")
    .select(["m.kind", "m.mime_type", "m.source", "m.external_url", "m.storage_bucket", "m.storage_path", "m.alt_text", "m.duration_ms", "m.upload_status"])
    .where("pm.post_id", "=", job.post_id)
    .orderBy("pm.position")
    .execute();

  const platform = target.platform as Platform;
  const name = PLATFORM_META[platform].name;
  const validate = () => {
    const issues = validateForPlatform(
      {
        caption: target.caption,
        hashtags: target.hashtags,
        title: target.title,
        firstComment: target.first_comment,
        linkUrl: target.link_url,
        media: media.map((m) => ({ kind: m.kind as "image" | "video", durationMs: m.duration_ms })),
      },
      platform,
      target.caption_override,
    ).filter((i) => i.severity === "error");
    if (issues.length) throw new PermanentError("validation_failed", issues.map((i) => i.message).join(" "));
  };

  if (job.is_demo) {
    validate();
    return { kind: "demo" as const };
  }

  // Connection and integration problems come first: they need a person to act.
  if (target.account_deleted_at || target.connection_status !== "connected") {
    throw new BlockedError("account_not_connected", ACCOUNT_BLOCK_REASONS[target.connection_status] ?? "The account isn't connected.");
  }
  const provider = deps.registry.get(platform);
  const status = provider.status();
  if (!status.implemented || !status.configured) throw new BlockedError("integration_unavailable", status.summary);

  const kinds = new Set(media.map((m) => m.kind));
  const caps = provider.capabilities.publish;
  const supported =
    (media.length === 0 ? caps.text : true) &&
    (!kinds.has("image") || caps.image) &&
    (!kinds.has("video") || caps.video) &&
    (media.length <= 1 || caps.carousel);
  if (!supported) throw new BlockedError("capability_unsupported", `${name}'s integration can't publish this kind of post yet.`);
  validate();
  if (media.some((m) => m.upload_status !== "ready")) throw new PermanentError("media_not_ready", "A media upload didn't finish.");

  const connection = await db
    .selectFrom("oauth_connections")
    .select(["access_token_ciphertext", "access_token_expires_at", "revoked_at"])
    .where("social_account_id", "=", target.account_id)
    .executeTakeFirst();
  if (!connection?.access_token_ciphertext || connection.revoked_at) {
    throw new BlockedError("token_missing", "No valid access token is stored for this account. Reconnect it.");
  }
  if (connection.access_token_expires_at && connection.access_token_expires_at <= (deps.now?.() ?? new Date())) {
    throw new BlockedError("token_expired", "The access token expired and hasn't been refreshed yet. Reconnect the account.");
  }
  const ring = deps.keyRing!();
  const mediaForProvider: PublishRequest["media"] = [];
  for (const m of media) {
    const url =
      m.source === "url"
        ? m.external_url!
        : deps.storageUrl
          ? await deps.storageUrl(m.storage_bucket!, m.storage_path!)
          : (() => {
              throw new BlockedError("storage_unavailable", "Uploaded media needs Supabase Storage to be configured.");
            })();
    mediaForProvider.push({ kind: m.kind as "image" | "video", url, mimeType: m.mime_type, altText: m.alt_text });
  }

  const request: PublishRequest = {
    accessToken: decryptSecret(ring, connection.access_token_ciphertext, target.account_id),
    externalAccountId: target.external_account_id,
    idempotencyKey: job.idempotency_key,
    text: composeCaption(target.caption_override ?? target.caption, target.hashtags),
    title: target.title,
    firstComment: target.first_comment,
    linkUrl: target.link_url,
    media: mediaForProvider,
    settings: (target.settings ?? {}) as Record<string, unknown>,
  };
  return { kind: "live" as const, provider, request };
}

async function attempt(db: Kysely<DB>, job: Job, deps: Required<Pick<WorkerDeps, "registry">> & WorkerDeps): Promise<Outcome> {
  let idempotentProvider = false;
  try {
    const prepared = await prepare(db, job, deps);
    if (prepared.kind === "demo") return { kind: "simulated", note: simulatePublish().note };
    idempotentProvider = prepared.provider.capabilities.idempotentPublish;
    const result = await prepared.provider.publish(prepared.request);
    if (!result?.externalPostId) {
      // Never treat an unconfirmed response as published.
      return { kind: "unknown", code: "unconfirmed", message: "The platform responded without confirming a post id." };
    }
    return { kind: "succeeded", result };
  } catch (error) {
    return decide(error, { attempts: job.attempts, maxAttempts: job.max_attempts, idempotentProvider, random: deps.random });
  }
}

const TARGET_STATUS: Record<Outcome["kind"], "published" | "simulated" | "scheduled" | "failed" | "blocked"> = {
  succeeded: "published",
  simulated: "simulated",
  retry: "scheduled",
  fail: "failed",
  unknown: "failed",
  block: "blocked",
};

async function finalize(db: Kysely<DB>, job: Job, outcome: Outcome, now: Date) {
  await withSystem(async (trx) => {
    const done = outcome.kind !== "retry";
    const errorFields =
      outcome.kind === "retry" || outcome.kind === "fail" || outcome.kind === "block" || outcome.kind === "unknown"
        ? { error_code: outcome.code, last_error: outcome.message.slice(0, 1000) }
        : { error_code: null, last_error: null };
    await trx
      .updateTable("publishing_jobs")
      .set({
        status:
          outcome.kind === "succeeded"
            ? "succeeded"
            : outcome.kind === "simulated"
              ? "simulated"
              : outcome.kind === "retry"
                ? "pending"
                : outcome.kind === "block"
                  ? "blocked"
                  : "failed",
        run_at: outcome.kind === "retry" ? new Date(now.getTime() + outcome.delayMs) : job.run_at,
        locked_at: null,
        locked_by: null,
        completed_at: done ? now : null,
        provider_response:
          outcome.kind === "succeeded"
            ? JSON.stringify({ externalPostId: outcome.result.externalPostId, ...(outcome.result.details ?? {}) })
            : outcome.kind === "simulated"
              ? JSON.stringify({ outcome: "simulated" })
              : null,
        ...errorFields,
      })
      .where("id", "=", job.id)
      .where("status", "=", "running")
      .execute();

    await trx
      .updateTable("post_platform_targets")
      .set({
        status: TARGET_STATUS[outcome.kind],
        last_error: "message" in outcome && outcome.kind !== "retry" ? outcome.message.slice(0, 1000) : null,
        ...(outcome.kind === "succeeded"
          ? {
              external_post_id: outcome.result.externalPostId,
              external_url: outcome.result.externalUrl?.startsWith("https://") ? outcome.result.externalUrl : null,
              published_at: outcome.result.publishedAt,
            }
          : {}),
      })
      .where("id", "=", job.target_id)
      .execute();

    await sql`select app.refresh_post_status(${job.post_id}::uuid)`.execute(trx);

    if (outcome.kind === "succeeded") {
      const ws = await trx.selectFrom("workspaces").select("organization_id").where("id", "=", job.workspace_id).executeTakeFirstOrThrow();
      await trx
        .insertInto("usage_records")
        .values({ organization_id: ws.organization_id, workspace_id: job.workspace_id, metric: "post_published", metadata: JSON.stringify({ job_id: job.id }) })
        .execute();
    }
    if (outcome.kind === "fail" || outcome.kind === "block" || outcome.kind === "unknown") {
      const post = await trx.selectFrom("content_posts").select(["title", "caption"]).where("id", "=", job.post_id).executeTakeFirst();
      const slug = await trx.selectFrom("workspaces").select(["slug", "organization_id"]).where("id", "=", job.workspace_id).executeTakeFirstOrThrow();
      await notifyWorkspaceAdmins(trx, job.workspace_id, {
        organizationId: slug.organization_id,
        kind: `publishing.${outcome.kind === "block" ? "blocked" : "failed"}`,
        severity: outcome.kind === "block" ? "warning" : "error",
        title: `${outcome.kind === "block" ? "Blocked" : "Failed"}: ${post?.title || post?.caption.slice(0, 60) || "a scheduled post"}`,
        body: outcome.message.slice(0, 500),
        link: `/w/${slug.slug}/content/${job.post_id}`,
      });
    }
  }, db);
}

export type BatchSummary = { claimed: number; succeeded: number; simulated: number; retried: number; failed: number; blocked: number; recovered: number };

/**
 * Processes one batch of due jobs. Safe to run concurrently from several
 * workers or cron invocations: claiming uses FOR UPDATE SKIP LOCKED.
 */
export async function runPublishingBatch(options: { workerId: string; limit?: number } & WorkerDeps): Promise<BatchSummary> {
  const db = options.db ?? getDb();
  const deps = { ...options, registry: options.registry ?? defaultRegistry };
  const now = () => options.now?.() ?? new Date();
  const summary: BatchSummary = { claimed: 0, succeeded: 0, simulated: 0, retried: 0, failed: 0, blocked: 0, recovered: 0 };

  const recovered = await sql<{ n: number }>`select app.recover_stale_jobs(interval '15 minutes') as n`.execute(db);
  summary.recovered = Number(recovered.rows[0]?.n ?? 0);

  const claimed = await withSystem(async (trx) => {
    const { rows } = await sql<Job>`select * from app.claim_publishing_jobs(${options.workerId}, ${options.limit ?? 10})`.execute(trx);
    for (const job of rows) {
      await trx.updateTable("post_platform_targets").set({ status: "publishing" }).where("id", "=", job.target_id).execute();
      await sql`select app.refresh_post_status(${job.post_id}::uuid)`.execute(trx);
    }
    return rows;
  }, db);
  summary.claimed = claimed.length;

  for (const job of claimed) {
    const outcome = await attempt(db, job, deps);
    try {
      await finalize(db, job, outcome, now());
    } catch (error) {
      // The lock expires and recover_stale_jobs marks it unknown; never guess.
      logger.error("publishing.finalize_failed", { jobId: job.id, outcome: outcome.kind, error });
      continue;
    }
    const key = outcome.kind === "succeeded" ? "succeeded" : outcome.kind === "simulated" ? "simulated" : outcome.kind === "retry" ? "retried" : outcome.kind === "block" ? "blocked" : "failed";
    summary[key] += 1;
    logger.info("publishing.attempt", { jobId: job.id, outcome: outcome.kind, code: "code" in outcome ? outcome.code : undefined });
  }

  await recordHeartbeat(db, "publishing-worker", { workerId: options.workerId, ...summary });
  return summary;
}

export async function recordHeartbeat(db: Executor, component: string, metadata: Record<string, unknown>) {
  await db
    .insertInto("system_heartbeats")
    .values({ component, last_seen_at: new Date(), metadata: JSON.stringify(metadata) })
    .onConflict((oc) => oc.column("component").doUpdateSet({ last_seen_at: new Date(), metadata: JSON.stringify(metadata) }))
    .execute();
}
