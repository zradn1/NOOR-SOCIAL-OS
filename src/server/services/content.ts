import "server-only";
import { randomUUID } from "node:crypto";
import { sql, type Insertable } from "kysely";
import { validateForPlatforms, type ValidationIssue } from "@/lib/platforms/constraints";
import { PLATFORM_META, type Platform } from "@/lib/platforms/registry";
import { zonedToUtc } from "@/lib/time/zoned";
import { postInputSchema, type PostInput } from "@/lib/validation/content";
import { assertCan, type WorkspaceContext } from "@/server/auth/guard";
import { getDb, withUser, type Tx } from "@/server/db/client";
import type { DB } from "@/server/db/schema.generated";
import { env } from "@/server/env";
import { AppError, notFound } from "@/server/errors";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export type PostStatus =
  | "draft"
  | "ready"
  | "scheduled"
  | "publishing"
  | "published"
  | "partially_published"
  | "failed"
  | "simulated"
  | "archived";

export type PostListItem = {
  id: string;
  title: string | null;
  caption: string;
  status: PostStatus;
  scheduledAt: string | null;
  plannedFor: string | null;
  publishedAt: string | null;
  updatedAt: string;
  isDemo: boolean;
  targets: { platform: Platform; status: string }[];
  mediaCount: number;
};

const LIST_STATUSES: Record<string, PostStatus[]> = {
  drafts: ["draft"],
  ready: ["ready"],
  scheduled: ["scheduled", "publishing"],
  published: ["published", "partially_published"],
  simulated: ["simulated"],
  failed: ["failed"],
  archived: ["archived"],
};

export async function listPosts(
  ctx: WorkspaceContext,
  filter: { status?: string; q?: string; limit?: number } = {},
  db = getDb(),
): Promise<PostListItem[]> {
  const rows = await withUser(
    ctx.identity,
    (trx) => {
      let q = trx
        .selectFrom("content_posts as p")
        .select([
          "p.id",
          "p.title",
          "p.caption",
          "p.status",
          "p.scheduled_at",
          "p.planned_for",
          "p.published_at",
          "p.updated_at",
          "p.is_demo",
          (eb) =>
            eb
              .selectFrom("post_platform_targets as t")
              .select(sql<{ platform: Platform; status: string }[]>`coalesce(json_agg(json_build_object('platform', t.platform, 'status', t.status) order by t.created_at), '[]')`.as("t"))
              .whereRef("t.post_id", "=", "p.id")
              .as("targets"),
          (eb) =>
            eb.selectFrom("post_media as m").select((e) => e.fn.countAll<number>().as("n")).whereRef("m.post_id", "=", "p.id").as("media_count"),
        ])
        .where("p.workspace_id", "=", ctx.workspace.id);
      const statuses = filter.status ? LIST_STATUSES[filter.status] : undefined;
      q = statuses ? q.where("p.status", "in", statuses) : q.where("p.status", "<>", "archived");
      if (filter.q?.trim()) {
        const term = `%${filter.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        q = q.where((eb) => eb.or([eb("p.title", "ilike", term), eb("p.caption", "ilike", term)]));
      }
      return q.orderBy("p.updated_at", "desc").limit(filter.limit ?? 100).execute();
    },
    db,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    caption: r.caption,
    status: r.status,
    scheduledAt: r.scheduled_at?.toISOString() ?? null,
    plannedFor: r.planned_for?.toISOString() ?? null,
    publishedAt: r.published_at?.toISOString() ?? null,
    updatedAt: r.updated_at.toISOString(),
    isDemo: r.is_demo,
    targets: (r.targets ?? []) as PostListItem["targets"],
    mediaCount: Number(r.media_count ?? 0),
  }));
}

export type MediaView = {
  id: string;
  source: "storage" | "url";
  kind: "image" | "video";
  mimeType: string;
  fileName: string | null;
  url: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  altText: string | null;
  uploadStatus: string;
};

export type PostDetail = {
  id: string;
  title: string | null;
  caption: string;
  hashtags: string[];
  firstComment: string | null;
  linkUrl: string | null;
  status: PostStatus;
  scheduledAt: string | null;
  scheduleTimezone: string | null;
  plannedFor: string | null;
  publishedAt: string | null;
  revision: number;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  targets: {
    id: string;
    accountId: string;
    platform: Platform;
    accountName: string;
    accountStatus: string;
    captionOverride: string | null;
    status: string;
    externalUrl: string | null;
    lastError: string | null;
    job: { id: string; status: string; errorCode: string | null; lastError: string | null; attempts: number; runAt: string } | null;
  }[];
  media: MediaView[];
};

function mediaView(m: {
  id: string;
  source: string;
  kind: string;
  mime_type: string;
  file_name: string | null;
  external_url: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  alt_text: string | null;
  upload_status: string;
}): MediaView {
  return {
    id: m.id,
    source: m.source as MediaView["source"],
    kind: m.kind as MediaView["kind"],
    mimeType: m.mime_type,
    fileName: m.file_name,
    url: m.external_url,
    width: m.width,
    height: m.height,
    durationMs: m.duration_ms,
    altText: m.alt_text,
    uploadStatus: m.upload_status,
  };
}

const MEDIA_COLUMNS = [
  "m.id",
  "m.source",
  "m.kind",
  "m.mime_type",
  "m.file_name",
  "m.external_url",
  "m.width",
  "m.height",
  "m.duration_ms",
  "m.alt_text",
  "m.upload_status",
] as const;

export async function getPost(ctx: WorkspaceContext, postId: string, db = getDb()): Promise<PostDetail | null> {
  return withUser(
    ctx.identity,
    async (trx) => {
      const p = await trx
        .selectFrom("content_posts")
        .selectAll()
        .where("id", "=", postId)
        .where("workspace_id", "=", ctx.workspace.id)
        .executeTakeFirst();
      if (!p) return null;
      const targets = await trx
        .selectFrom("post_platform_targets as t")
        .innerJoin("social_accounts as a", "a.id", "t.social_account_id")
        .leftJoin(
          (eb) =>
            eb
              .selectFrom("publishing_jobs")
              .distinctOn("target_id")
              .select(["id", "target_id", "status", "error_code", "last_error", "attempts", "run_at"])
              .where("post_id", "=", postId)
              .orderBy("target_id")
              .orderBy("created_at", "desc")
              .as("j"),
          (join) => join.onRef("j.target_id", "=", "t.id"),
        )
        .select([
          "t.id",
          "t.social_account_id",
          "t.platform",
          "a.display_name",
          "a.connection_status",
          "t.caption_override",
          "t.status",
          "t.external_url",
          "t.last_error",
          "j.id as job_id",
          "j.status as job_status",
          "j.error_code as job_error_code",
          "j.last_error as job_last_error",
          "j.attempts as job_attempts",
          "j.run_at as job_run_at",
        ])
        .where("t.post_id", "=", postId)
        .orderBy("t.created_at")
        .execute();
      const media = await trx
        .selectFrom("post_media as pm")
        .innerJoin("media_assets as m", "m.id", "pm.media_asset_id")
        .select(MEDIA_COLUMNS)
        .where("pm.post_id", "=", postId)
        .orderBy("pm.position")
        .execute();
      return {
        id: p.id,
        title: p.title,
        caption: p.caption,
        hashtags: p.hashtags,
        firstComment: p.first_comment,
        linkUrl: p.link_url,
        status: p.status,
        scheduledAt: p.scheduled_at?.toISOString() ?? null,
        scheduleTimezone: p.schedule_timezone,
        plannedFor: p.planned_for?.toISOString() ?? null,
        publishedAt: p.published_at?.toISOString() ?? null,
        revision: p.revision,
        isDemo: p.is_demo,
        createdAt: p.created_at.toISOString(),
        updatedAt: p.updated_at.toISOString(),
        targets: targets.map((t) => ({
          id: t.id,
          accountId: t.social_account_id,
          platform: t.platform,
          accountName: t.display_name,
          accountStatus: t.connection_status,
          captionOverride: t.caption_override,
          status: t.status,
          externalUrl: t.external_url,
          lastError: t.last_error,
          job: t.job_id
            ? {
                id: t.job_id,
                status: t.job_status!,
                errorCode: t.job_error_code ?? null,
                lastError: t.job_last_error ?? null,
                attempts: t.job_attempts ?? 0,
                runAt: t.job_run_at!.toISOString(),
              }
            : null,
        })),
        media: media.map(mediaView),
      };
    },
    db,
  );
}

/** Accounts that can be chosen as destinations, with whether they can publish. */
export async function listDestinations(ctx: WorkspaceContext, db = getDb()) {
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("social_accounts")
        .select(["id", "platform", "display_name", "handle", "connection_status"])
        .where("workspace_id", "=", ctx.workspace.id)
        .orderBy("created_at")
        .execute(),
    db,
  );
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    name: r.display_name,
    handle: r.handle,
    status: r.connection_status,
    canPublish: r.connection_status === "connected" || r.connection_status === "demo",
  }));
}

export async function listMediaLibrary(ctx: WorkspaceContext, db = getDb()): Promise<MediaView[]> {
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("media_assets as m")
        .select(MEDIA_COLUMNS)
        .where("m.workspace_id", "=", ctx.workspace.id)
        .orderBy("m.created_at", "desc")
        .limit(60)
        .execute(),
    db,
  );
  return rows.map(mediaView);
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

async function syncTargets(trx: Tx, ctx: WorkspaceContext, postId: string, desired: { accountId: string; captionOverride: string | null }[]) {
  const existing = await trx
    .selectFrom("post_platform_targets")
    .select(["id", "social_account_id", "status", "caption_override"])
    .where("post_id", "=", postId)
    .execute();
  const wanted = new Map(desired.map((d) => [d.accountId, d]));
  for (const t of existing) {
    const want = wanted.get(t.social_account_id);
    if (!want) {
      const res = await trx.deleteFrom("post_platform_targets").where("id", "=", t.id).executeTakeFirst();
      if (!res.numDeletedRows) {
        throw new AppError("CONFLICT", "A destination that is scheduled or already published can't be removed. Unschedule the post first.");
      }
    } else if (want.captionOverride !== t.caption_override) {
      await trx.updateTable("post_platform_targets").set({ caption_override: want.captionOverride }).where("id", "=", t.id).execute();
    }
    wanted.delete(t.social_account_id);
  }
  for (const add of wanted.values()) {
    // `platform` is deliberately omitted: a trigger copies it from the account.
    await trx
      .insertInto("post_platform_targets")
      .values({
        workspace_id: ctx.workspace.id,
        post_id: postId,
        social_account_id: add.accountId,
        caption_override: add.captionOverride,
      } as Insertable<DB["post_platform_targets"]>)
      .execute();
  }
}

async function syncMedia(trx: Tx, ctx: WorkspaceContext, postId: string, mediaIds: string[]) {
  await trx.deleteFrom("post_media").where("post_id", "=", postId).execute();
  for (const [position, id] of mediaIds.entries()) {
    await trx
      .insertInto("post_media")
      .values({ post_id: postId, workspace_id: ctx.workspace.id, media_asset_id: id, position })
      .execute();
  }
}

export type SaveResult = { id: string; revision: number; issues: ValidationIssue[] };

/**
 * Creates or updates a post with its destinations and media, atomically and
 * through RLS. `expectedRevision` rejects saves over someone else's newer edit.
 */
export async function savePost(ctx: WorkspaceContext, raw: PostInput, db = getDb()): Promise<SaveResult> {
  assertCan(ctx, raw.id ? "content.edit" : "content.create");
  const input = postInputSchema.parse(raw);
  const plannedFor =
    input.plannedDate ? zonedToUtc(input.plannedDate, input.plannedTime ?? "09:00", ctx.workspace.timezone) : null;

  const saved = await withUser(
    ctx.identity,
    async (trx) => {
      let id = input.id;
      let status: PostStatus;
      if (!id) {
        const row = await trx
          .insertInto("content_posts")
          .values({
            workspace_id: ctx.workspace.id,
            title: input.title,
            caption: input.caption,
            hashtags: input.hashtags,
            first_comment: input.firstComment,
            link_url: input.linkUrl,
            planned_for: plannedFor,
            status: input.intent,
            created_by: ctx.user.id,
            updated_by: ctx.user.id,
          })
          .returning(["id", "status"])
          .executeTakeFirstOrThrow();
        id = row.id;
        status = row.status;
      } else {
        const current = await trx
          .selectFrom("content_posts")
          .select(["status", "revision"])
          .where("id", "=", id)
          .where("workspace_id", "=", ctx.workspace.id)
          .forUpdate()
          .executeTakeFirst();
        if (!current) throw notFound("This post no longer exists.");
        if (input.expectedRevision && current.revision !== input.expectedRevision) {
          throw new AppError("CONFLICT", "Someone else saved this post while you were editing. Reload to see their changes.");
        }
        const nextStatus = current.status === "draft" || current.status === "ready" ? input.intent : current.status;
        await trx
          .updateTable("content_posts")
          .set({
            title: input.title,
            caption: input.caption,
            hashtags: input.hashtags,
            first_comment: input.firstComment,
            link_url: input.linkUrl,
            planned_for: plannedFor,
            status: nextStatus,
            updated_by: ctx.user.id,
          })
          .where("id", "=", id)
          .execute();
        status = nextStatus;
      }
      if (status === "draft" || status === "ready") await syncTargets(trx, ctx, id, input.targets.map((t) => ({ accountId: t.accountId, captionOverride: t.captionOverride })));
      await syncMedia(trx, ctx, id, input.mediaIds);
      const { revision } = await trx.selectFrom("content_posts").select("revision").where("id", "=", id).executeTakeFirstOrThrow();
      return { id, revision };
    },
    db,
  ).catch((error: { code?: string }) => {
    if (error?.code === "23503") throw new AppError("VALIDATION", "A selected account or media item is no longer available.");
    throw error;
  });

  const detail = await getPost(ctx, saved.id, db);
  return { ...saved, issues: detail ? issuesFor(detail) : [] };
}

export function issuesFor(post: Pick<PostDetail, "caption" | "hashtags" | "title" | "firstComment" | "linkUrl" | "media" | "targets">) {
  return validateForPlatforms(
    {
      caption: post.caption,
      hashtags: post.hashtags,
      title: post.title,
      firstComment: post.firstComment,
      linkUrl: post.linkUrl,
      media: post.media.map((m) => ({ kind: m.kind, durationMs: m.durationMs })),
    },
    post.targets.filter((t) => t.status !== "cancelled").map((t) => ({ platform: t.platform, captionOverride: t.captionOverride })),
  );
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function duplicatePost(ctx: WorkspaceContext, postId: string, db = getDb()) {
  assertCan(ctx, "content.create");
  const source = await getPost(ctx, postId, db);
  if (!source) throw notFound("This post no longer exists.");
  const copy = await savePost(
    ctx,
    {
      title: `${source.title ?? source.caption.slice(0, 40) ?? "Untitled"} (copy)`.slice(0, 120),
      caption: source.caption,
      hashtags: source.hashtags,
      firstComment: source.firstComment ?? undefined,
      linkUrl: source.linkUrl ?? undefined,
      targets: source.targets.map((t) => ({ accountId: t.accountId, captionOverride: t.captionOverride ?? undefined })),
      mediaIds: source.media.map((m) => m.id),
      intent: "draft",
    },
    db,
  );
  return copy.id;
}

export async function setPostArchived(ctx: WorkspaceContext, postId: string, archived: boolean, db = getDb()) {
  assertCan(ctx, "content.edit");
  const res = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .updateTable("content_posts")
        .set({ status: archived ? "archived" : "draft", updated_by: ctx.user.id })
        .where("id", "=", postId)
        .where("workspace_id", "=", ctx.workspace.id)
        .executeTakeFirst(),
    db,
  );
  if (!res.numUpdatedRows) throw notFound("This post no longer exists.");
}

export async function deletePost(ctx: WorkspaceContext, postId: string, db = getDb()) {
  assertCan(ctx, "content.delete");
  const res = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .updateTable("content_posts")
        .set({ deleted_at: new Date(), updated_by: ctx.user.id })
        .where("id", "=", postId)
        .where("workspace_id", "=", ctx.workspace.id)
        .executeTakeFirst(),
    db,
  );
  if (!res.numUpdatedRows) throw notFound("This post no longer exists.");
}

/**
 * Schedules a post at a wall-clock time in the workspace's zone. Everything is
 * re-validated on the server: platform rules for every destination, and that
 * each destination can actually publish (demo or verified-connected).
 */
export async function schedulePost(ctx: WorkspaceContext, input: { postId: string; date: string; time: string }, db = getDb()) {
  assertCan(ctx, "content.schedule");
  const post = await getPost(ctx, input.postId, db);
  if (!post) throw notFound("This post no longer exists.");
  const active = post.targets.filter((t) => t.status !== "cancelled" && t.status !== "published" && t.status !== "simulated");
  if (!active.length) throw new AppError("VALIDATION", "Choose at least one destination before scheduling.");
  const unpublishable = active.filter((t) => !["connected", "demo"].includes(t.accountStatus));
  if (unpublishable.length) {
    const names = unpublishable.map((t) => `${PLATFORM_META[t.platform].name} (${t.accountName})`).join(", ");
    throw new AppError("VALIDATION", `These destinations can't publish because they aren't connected: ${names}.`);
  }
  const errors = issuesFor(post).filter((i) => i.severity === "error");
  if (errors.length) {
    throw new AppError("VALIDATION", `Fix ${errors.length} issue${errors.length > 1 ? "s" : ""} before scheduling: ${errors[0]!.message}`, {
      issues: errors,
    });
  }
  const at = zonedToUtc(input.date, input.time, ctx.workspace.timezone);
  await withUser(ctx.identity, (trx) => sql`select app.schedule_post(${post.id}::uuid, ${at}, ${ctx.workspace.timezone})`.execute(trx), db);
  return { scheduledAt: at.toISOString() };
}

export async function unschedulePost(ctx: WorkspaceContext, postId: string, db = getDb()) {
  assertCan(ctx, "content.schedule");
  await withUser(ctx.identity, (trx) => sql`select app.unschedule_post(${postId}::uuid)`.execute(trx), db);
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export async function addMediaByUrl(
  ctx: WorkspaceContext,
  input: { url: string; kind: "image" | "video"; mimeType: string; width?: number; height?: number; durationSeconds?: number; altText?: string },
  db = getDb(),
): Promise<MediaView> {
  assertCan(ctx, "media.upload");
  if (!input.mimeType.startsWith(`${input.kind}/`)) throw new AppError("VALIDATION", "The file type doesn't match the media kind.");
  const row = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .insertInto("media_assets")
        .values({
          workspace_id: ctx.workspace.id,
          source: "url",
          external_url: input.url,
          kind: input.kind,
          mime_type: input.mimeType,
          file_name: decodeURIComponent(new URL(input.url).pathname.split("/").pop() || "").slice(0, 200) || null,
          width: input.width ?? null,
          height: input.height ?? null,
          duration_ms: input.durationSeconds !== undefined ? Math.round(input.durationSeconds * 1000) : null,
          alt_text: input.altText || null,
          uploaded_by: ctx.user.id,
        })
        .returning(["id", "source", "kind", "mime_type", "file_name", "external_url", "width", "height", "duration_ms", "alt_text", "upload_status"])
        .executeTakeFirstOrThrow(),
    db,
  );
  return mediaView(row);
}

export function storageConfigured() {
  return Boolean(env().SUPABASE_SERVICE_ROLE_KEY && env().NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * Creates a pending media record and a short-lived signed upload URL in the
 * private bucket. The browser uploads directly to Storage; the file never
 * passes through this server.
 */
export async function createMediaUpload(
  ctx: WorkspaceContext,
  input: { fileName: string; mimeType: string; sizeBytes: number },
  db = getDb(),
) {
  assertCan(ctx, "media.upload");
  if (!storageConfigured()) throw new AppError("NOT_CONFIGURED", "File uploads need Supabase Storage to be configured. Add media by link instead.");
  const kind = input.mimeType.startsWith("video/") ? "video" : "image";
  const safeName = input.fileName.replace(/[^\w.-]+/g, "-").replace(/^-+/, "").slice(0, 120) || "file";
  const path = `${ctx.workspace.id}/${randomUUID()}/${safeName}`;
  const bucket = env().SUPABASE_STORAGE_BUCKET;
  const { data, error } = await createSupabaseAdminClient().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new AppError("INTERNAL", "Storage didn't accept the upload request. Try again.");
  const row = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .insertInto("media_assets")
        .values({
          workspace_id: ctx.workspace.id,
          source: "storage",
          storage_bucket: bucket,
          storage_path: path,
          kind,
          mime_type: input.mimeType,
          file_name: safeName,
          size_bytes: input.sizeBytes,
          upload_status: "pending",
          uploaded_by: ctx.user.id,
        })
        .returning("id")
        .executeTakeFirstOrThrow(),
    db,
  );
  return { assetId: row.id, path, token: data.token, signedUrl: data.signedUrl };
}

/** Marks an upload ready once Storage confirms the object exists. */
export async function confirmMediaUpload(ctx: WorkspaceContext, assetId: string, db = getDb()) {
  assertCan(ctx, "media.upload");
  const asset = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("media_assets")
        .select(["storage_bucket", "storage_path"])
        .where("id", "=", assetId)
        .where("workspace_id", "=", ctx.workspace.id)
        .where("source", "=", "storage")
        .executeTakeFirst(),
    db,
  );
  if (!asset?.storage_path || !asset.storage_bucket) throw notFound("Upload not found.");
  const folder = asset.storage_path.split("/").slice(0, -1).join("/");
  const name = asset.storage_path.split("/").pop()!;
  const { data } = await createSupabaseAdminClient().storage.from(asset.storage_bucket).list(folder, { search: name });
  const exists = data?.some((o) => o.name === name);
  await db
    .updateTable("media_assets")
    .set({ upload_status: exists ? "ready" : "failed" })
    .where("id", "=", assetId)
    .execute();
  if (!exists) throw new AppError("VALIDATION", "The upload didn't complete. Try again.");
}
