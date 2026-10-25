import "server-only";
import { sql } from "kysely";
import {
  dailySeries,
  engagementsOf,
  previousRange,
  provenanceOf,
  summarize,
  type DateRange,
  type SnapshotRow,
} from "@/lib/analytics/aggregate";
import type { DataSource } from "@/lib/analytics/data-source";
import { METRICS, type Metric } from "@/lib/platforms/metrics";
import type { Platform } from "@/lib/platforms/registry";
import { addDays } from "@/lib/time/zoned";
import type { WorkspaceContext } from "@/server/auth/context";
import { getDb, withUser } from "@/server/db/client";

/** Account-level snapshots for the range (plus lookback for carry-forward), via RLS. */
export async function loadAccountSnapshots(
  ctx: WorkspaceContext,
  range: DateRange,
  platforms: Platform[] | null,
  lookbackDays = 120,
  db = getDb(),
): Promise<SnapshotRow[]> {
  const rows = await withUser(
    ctx.identity,
    (trx) => {
      let q = trx
        .selectFrom("analytics_snapshots as s")
        .innerJoin("social_accounts as a", "a.id", "s.social_account_id")
        .select(["s.social_account_id", "s.platform", "s.metric_date", "s.data_source", "s.captured_at", ...METRICS.map((m) => `s.${m}` as const)])
        .where("s.workspace_id", "=", ctx.workspace.id)
        .where("s.target_id", "is", null)
        .where("a.deleted_at", "is", null)
        .where("s.metric_date", ">=", addDays(range.from, -lookbackDays))
        .where("s.metric_date", "<=", range.to);
      if (platforms?.length) q = q.where("s.platform", "in", platforms);
      return q.orderBy("s.metric_date").execute();
    },
    db,
  );
  return rows.map((r) => {
    const metrics: SnapshotRow["metrics"] = {};
    for (const m of METRICS) {
      const v = (r as Record<string, unknown>)[m];
      metrics[m] = v === null || v === undefined ? null : Number(v);
    }
    return {
      accountId: r.social_account_id,
      platform: r.platform,
      date: r.metric_date,
      source: r.data_source as DataSource,
      capturedAt: r.captured_at.toISOString(),
      metrics,
    };
  });
}

export type AnalyticsOverview = Awaited<ReturnType<typeof getAnalyticsOverview>>;

export async function getAnalyticsOverview(ctx: WorkspaceContext, range: DateRange, platforms: Platform[] | null, db = getDb()) {
  const previous = previousRange(range);
  const rows = await loadAccountSnapshots(ctx, range, platforms, 120 + (Date.parse(range.from) - Date.parse(previous.from)) / 86_400_000, db);
  const inRange = rows.filter((r) => r.date >= range.from && r.date <= range.to);
  const platformsPresent = [...new Set(rows.map((r) => r.platform))];

  const byPlatform = platformsPresent.map((platform) => {
    const platformRows = rows.filter((r) => r.platform === platform);
    const s = summarize(platformRows, range);
    return { platform, summary: s, provenance: provenanceOf(platformRows.filter((r) => r.date >= range.from && r.date <= range.to)) };
  });

  return {
    range,
    previous,
    current: summarize(rows, range),
    prior: summarize(rows, previous),
    provenance: provenanceOf(inRange),
    followerSeries: dailySeries(rows, range, "followers"),
    reachSeries: dailySeries(rows, range, "reach"),
    viewsSeries: dailySeries(rows, range, "views"),
    engagementSeries: dailySeries(rows, range, "engagements"),
    byPlatform,
    latestCapturedAt: inRange.reduce<string | null>((max, r) => (max && max > r.capturedAt ? max : r.capturedAt), null),
    hasData: inRange.length > 0,
  };
}

/** Daily series for any single metric (analytics explorer). */
export async function getMetricSeries(ctx: WorkspaceContext, range: DateRange, platforms: Platform[] | null, metric: Metric | "engagements", db = getDb()) {
  const rows = await loadAccountSnapshots(ctx, range, platforms, metric === "followers" ? 120 : 0, db);
  return { series: dailySeries(rows, range, metric), provenance: provenanceOf(rows.filter((r) => r.date >= range.from)) };
}

export type TopPost = {
  targetId: string;
  postId: string;
  title: string | null;
  caption: string;
  platform: Platform;
  targetStatus: string;
  source: DataSource;
  engagements: number | null;
  reach: number | null;
  views: number | null;
  date: string;
};

/** Best posts in the range by engagements (latest cumulative snapshot per target). */
export async function getTopPosts(ctx: WorkspaceContext, range: DateRange, limit = 5, db = getDb()): Promise<TopPost[]> {
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("analytics_snapshots as s")
        .innerJoin("post_platform_targets as t", "t.id", "s.target_id")
        .innerJoin("content_posts as p", "p.id", "t.post_id")
        .distinctOn("s.target_id")
        .select([
          "s.target_id",
          "p.id as post_id",
          "p.title",
          "p.caption",
          "s.platform",
          "t.status as target_status",
          "s.data_source",
          "s.metric_date",
          "s.reach",
          "s.views",
          "s.likes",
          "s.comments",
          "s.shares",
          "s.saves",
        ])
        .where("s.workspace_id", "=", ctx.workspace.id)
        .where("s.target_id", "is not", null)
        .where("s.metric_date", ">=", range.from)
        .where("s.metric_date", "<=", range.to)
        .orderBy("s.target_id")
        .orderBy("s.metric_date", "desc")
        .execute(),
    db,
  );
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return rows
    .map((r) => ({
      targetId: r.target_id!,
      postId: r.post_id,
      title: r.title,
      caption: r.caption,
      platform: r.platform,
      targetStatus: r.target_status,
      source: r.data_source as DataSource,
      engagements: engagementsOf({ likes: num(r.likes), comments: num(r.comments), shares: num(r.shares), saves: num(r.saves) }),
      reach: num(r.reach),
      views: num(r.views),
      date: r.metric_date,
    }))
    .sort((a, b) => (b.engagements ?? -1) - (a.engagements ?? -1))
    .slice(0, limit);
}

export type UpcomingPost = {
  id: string;
  title: string | null;
  caption: string;
  scheduledAt: string;
  status: string;
  platforms: Platform[];
};

export async function getUpcomingPosts(ctx: WorkspaceContext, limit = 6, db = getDb()): Promise<UpcomingPost[]> {
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("content_posts as p")
        .select([
          "p.id",
          "p.title",
          "p.caption",
          "p.scheduled_at",
          "p.status",
          (eb) =>
            eb
              .selectFrom("post_platform_targets as t")
              .select(sql<Platform[]>`coalesce(array_agg(distinct t.platform::text), '{}')`.as("platforms"))
              .whereRef("t.post_id", "=", "p.id")
              .where("t.status", "<>", "cancelled")
              .as("platforms"),
        ])
        .where("p.workspace_id", "=", ctx.workspace.id)
        .where("p.deleted_at", "is", null)
        .where("p.status", "in", ["scheduled", "publishing"])
        .where("p.scheduled_at", ">=", sql<Date>`now() - interval '1 hour'`)
        .orderBy("p.scheduled_at")
        .limit(limit)
        .execute(),
    db,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    caption: r.caption,
    scheduledAt: r.scheduled_at!.toISOString(),
    status: r.status,
    platforms: (r.platforms ?? []) as Platform[],
  }));
}

/** Target outcomes within the range (published = provider-confirmed only). */
export async function getPublishingOutcomes(ctx: WorkspaceContext, since: Date, db = getDb()) {
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("publishing_jobs")
        .select(["status", (eb) => eb.fn.countAll<number>().as("n")])
        .where("workspace_id", "=", ctx.workspace.id)
        .where((eb) => eb.or([eb("completed_at", ">=", since), eb("status", "in", ["pending", "running"])]))
        .groupBy("status")
        .execute(),
    db,
  );
  const counts = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
  return {
    published: counts.succeeded ?? 0,
    simulated: counts.simulated ?? 0,
    failed: (counts.failed ?? 0) + (counts.blocked ?? 0),
    queued: (counts.pending ?? 0) + (counts.running ?? 0),
  };
}
