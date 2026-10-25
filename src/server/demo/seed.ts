import "server-only";
import { randomUUID } from "node:crypto";
import { ENGAGEMENT_METRICS, isMetricAvailable, METRICS, type Metric } from "@/lib/platforms/metrics";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/platforms/registry";
import { PLATFORM_RULES } from "@/lib/platforms/constraints";
import type { Tx } from "@/server/db/client";
import { seededRandom } from "@/server/integrations/demo";
import { DEMO_MEDIA_HOST, DEMO_POSTS } from "./content";

/*
 * Synthetic data for demo workspaces. Values are generated from a seeded PRNG,
 * stored with data_source = 'demo', and only ever written into workspaces
 * whose is_demo flag is set (the database rejects anything else).
 */

const BASE_FOLLOWERS: Record<Platform, number> = {
  instagram: 48_000,
  tiktok: 92_000,
  facebook: 21_000,
  youtube: 12_400,
  linkedin: 6_400,
  x: 15_200,
  pinterest: 9_100,
};

const DAY_MS = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

type MetricRow = Partial<Record<Metric, number | null>>;

/** Daily account-level metrics for one platform, oldest first. */
export function generateAccountSeries(platform: Platform, seed: string, days: number, today: Date) {
  const rand = seededRandom(`${seed}:${platform}`);
  let followers = Math.round(BASE_FOLLOWERS[platform] * (0.85 + rand() * 0.3));
  const growth = 0.0012 + rand() * 0.0025;
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const rows: { date: string; metrics: MetricRow }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const t = end - i * DAY_MS;
    const weekday = new Date(t).getUTCDay();
    const weekly = weekday === 0 || weekday === 6 ? 0.82 : 1.05;
    const spike = rand() < 0.04 ? 1.8 + rand() * 1.5 : 1;
    followers = Math.max(0, Math.round(followers * (1 + growth * (0.4 + rand() * 1.2) * (spike > 1 ? 2 : 1))));
    const reach = Math.round(followers * (0.06 + rand() * 0.1) * weekly * spike);
    const likes = Math.round(reach * (0.025 + rand() * 0.03));
    const all: Record<Metric, number> = {
      followers,
      reach,
      impressions: Math.round(reach * (1.3 + rand() * 0.5)),
      views: Math.round(reach * (platform === "tiktok" || platform === "youtube" ? 2.4 : 1.2) * (0.8 + rand() * 0.4)),
      profile_views: Math.round(reach * (0.012 + rand() * 0.01)),
      likes,
      comments: Math.round(likes * (0.03 + rand() * 0.04)),
      shares: Math.round(likes * (0.05 + rand() * 0.08)),
      saves: Math.round(likes * (0.08 + rand() * 0.1)),
      clicks: Math.round(reach * (0.004 + rand() * 0.006)),
      watch_time_seconds: Math.round(reach * 2.4 * (25 + rand() * 40)),
    };
    const metrics: MetricRow = {};
    for (const m of METRICS) metrics[m] = isMetricAvailable(platform, m) ? all[m] : null;
    rows.push({ date: isoDay(t), metrics });
  }
  return rows;
}

export async function seedAccountAnalytics(
  trx: Tx,
  input: { workspaceId: string; accountId: string; platform: Platform; seed: string; today: Date; days?: number },
) {
  const series = generateAccountSeries(input.platform, input.seed, input.days ?? 120, input.today);
  const values = series.map((row) => ({
    workspace_id: input.workspaceId,
    social_account_id: input.accountId,
    platform: input.platform,
    metric_date: row.date,
    data_source: "demo" as const,
    ...row.metrics,
    // "Synced" the morning after each day, except today which is partial.
    captured_at: new Date(Math.min(Date.parse(`${row.date}T00:00:00Z`) + 27 * 3_600_000, input.today.getTime() - 3_600_000)),
    raw: JSON.stringify({ generator: "noor-demo-v1" }),
  }));
  for (let i = 0; i < values.length; i += 200) {
    await trx.insertInto("analytics_snapshots").values(values.slice(i, i + 200)).execute();
  }
  await trx
    .updateTable("social_accounts")
    .set({ last_synced_at: new Date(input.today.getTime() - 3_600_000) })
    .where("id", "=", input.accountId)
    .execute();
}

const MIME = { image: "image/jpeg", video: "video/mp4" } as const;

/**
 * Fills a fresh demo workspace: one simulated account per platform, 120 days
 * of synthetic analytics, simulated past posts with post-level metrics,
 * upcoming scheduled posts, drafts, and one simulated failure so the failure
 * views can be explored.
 */
export async function seedDemoWorkspace(
  trx: Tx,
  input: { workspaceId: string; organizationId: string; userId: string; now: Date },
) {
  const { workspaceId, organizationId, userId, now } = input;
  const rand = seededRandom(workspaceId);
  const accounts = new Map<Platform, string>();

  for (const platform of PLATFORMS) {
    const row = await trx
      .insertInto("social_accounts")
      .values({
        workspace_id: workspaceId,
        organization_id: organizationId,
        platform,
        display_name: `Maison Lumière · ${PLATFORM_META[platform].name}`,
        handle: `maisonlumiere.demo`,
        external_account_id: `demo_${platform}_${randomUUID().slice(0, 8)}`,
        connection_status: "demo",
        connected_by: userId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    accounts.set(platform, row.id);
    await seedAccountAnalytics(trx, { workspaceId, accountId: row.id, platform, seed: workspaceId, today: now });
  }

  // Each post goes to the platforms whose rules its media satisfies.
  const fits = (platform: Platform, media: ("image" | "video")[]) => {
    const rules = PLATFORM_RULES[platform];
    if (rules.requiresMedia && media.length === 0) return false;
    if (media.some((k) => !rules.mediaKinds.includes(k))) return false;
    if (media.length > rules.maxMediaItems) return false;
    if (media.filter((k) => k === "video").length > rules.maxVideos) return false;
    if (!rules.mixedMedia && new Set(media).size > 1) return false;
    return true;
  };

  for (const [index, post] of DEMO_POSTS.entries()) {
    const platforms = PLATFORMS.filter((p) => fits(p, post.media) && (p !== "youtube" || post.media[0] === "video"))
      .filter(() => rand() < 0.55)
      .slice(0, 4);
    const chosen = platforms.length ? platforms : (["linkedin", "facebook"] as Platform[]).filter((p) => fits(p, post.media));
    if (!chosen.length) continue;

    // 0–8 past (simulated), 9–13 upcoming (scheduled), 14–16 drafts, 17 failure example.
    const kind = index <= 8 ? "past" : index <= 13 ? "upcoming" : index <= 16 ? "draft" : "failed";
    const startOfHour = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
    const at =
      kind === "past"
        ? new Date(startOfHour - (28 - index * 3) * DAY_MS - Math.floor(rand() * 8) * 3_600_000)
        : kind === "upcoming"
          ? new Date(startOfHour + (index - 8) * 2 * DAY_MS + (9 + Math.floor(rand() * 9)) * 3_600_000)
          : kind === "failed"
            ? new Date(startOfHour - 2 * DAY_MS)
            : new Date(startOfHour + (index - 12) * 3 * DAY_MS);

    const postRow = await trx
      .insertInto("content_posts")
      .values({
        workspace_id: workspaceId,
        title: post.title,
        caption: post.caption,
        hashtags: post.hashtags,
        status: kind === "past" ? "simulated" : kind === "upcoming" ? "scheduled" : kind === "failed" ? "failed" : "draft",
        scheduled_at: kind === "draft" ? null : at,
        schedule_timezone: kind === "draft" ? null : "UTC",
        planned_for: kind === "draft" && index !== 16 ? at : null,
        created_by: userId,
        updated_by: userId,
        created_at: new Date(at.getTime() - 3 * DAY_MS),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    for (const [position, mediaKind] of post.media.entries()) {
      const asset = await trx
        .insertInto("media_assets")
        .values({
          workspace_id: workspaceId,
          source: "url",
          external_url: `${DEMO_MEDIA_HOST}/${index}-${position}.${mediaKind === "image" ? "jpg" : "mp4"}`,
          kind: mediaKind,
          mime_type: MIME[mediaKind],
          file_name: `${post.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${position + 1}.${mediaKind === "image" ? "jpg" : "mp4"}`,
          width: 1080,
          height: mediaKind === "image" ? 1350 : 1920,
          duration_ms: mediaKind === "video" ? 18_000 + Math.floor(rand() * 30_000) : null,
          alt_text: `Demo ${mediaKind} for "${post.title}"`,
          uploaded_by: userId,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("post_media")
        .values({ post_id: postRow.id, workspace_id: workspaceId, media_asset_id: asset.id, position })
        .execute();
    }

    for (const platform of chosen) {
      const accountId = accounts.get(platform)!;
      const targetStatus = kind === "past" ? "simulated" : kind === "upcoming" ? "scheduled" : kind === "failed" ? "failed" : "pending";
      const target = await trx
        .insertInto("post_platform_targets")
        .values({
          workspace_id: workspaceId,
          post_id: postRow.id,
          social_account_id: accountId,
          platform,
          status: targetStatus,
          last_error: kind === "failed" ? "Simulated failure (demo): the media file could not be fetched." : null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      if (kind !== "draft") {
        await trx
          .insertInto("publishing_jobs")
          .values({
            workspace_id: workspaceId,
            post_id: postRow.id,
            target_id: target.id,
            idempotency_key: `publish:${target.id}:${Math.floor(at.getTime() / 1000)}`,
            status: kind === "past" ? "simulated" : kind === "upcoming" ? "pending" : "failed",
            run_at: at,
            attempts: kind === "upcoming" ? 0 : kind === "failed" ? 5 : 1,
            completed_at: kind === "upcoming" ? null : at,
            error_code: kind === "failed" ? "demo_media_unreachable" : null,
            last_error: kind === "failed" ? "Simulated failure (demo): the media file could not be fetched." : null,
            provider_response: kind === "past" ? JSON.stringify({ outcome: "simulated" }) : null,
            created_by: userId,
          })
          .execute();
      }

      if (kind === "past") {
        // Post-level metrics accumulate over the days after the simulated post.
        const prand = seededRandom(`${target.id}`);
        const reachBase = 1_500 + prand() * 14_000;
        const days = Math.min(7, Math.max(1, Math.floor((now.getTime() - at.getTime()) / DAY_MS)));
        let cumulative = 0;
        for (let d = 0; d < days; d++) {
          cumulative += reachBase * (d === 0 ? 0.55 : 0.45 / (d + 1));
          const reach = Math.round(cumulative);
          const likes = Math.round(reach * (0.035 + prand() * 0.05));
          const values: MetricRow = {
            reach,
            impressions: Math.round(reach * 1.35),
            views: Math.round(reach * (post.media[0] === "video" ? 2.2 : 1.1)),
            likes,
            comments: Math.round(likes * 0.06),
            shares: Math.round(likes * 0.09),
            saves: Math.round(likes * 0.12),
            clicks: Math.round(reach * 0.007),
          };
          const filtered: MetricRow = {};
          for (const m of METRICS) if (m !== "followers" && isMetricAvailable(platform, m)) filtered[m] = values[m] ?? null;
          await trx
            .insertInto("analytics_snapshots")
            .values({
              workspace_id: workspaceId,
              social_account_id: accountId,
              target_id: target.id,
              platform,
              metric_date: isoDay(at.getTime() + d * DAY_MS),
              data_source: "demo",
              ...filtered,
              raw: JSON.stringify({ generator: "noor-demo-v1", engagement_metrics: ENGAGEMENT_METRICS }),
            })
            .execute();
        }
      }
    }
  }

  // Simulated usage history, flagged demo so it never counts against limits.
  await trx
    .insertInto("usage_records")
    .values({ organization_id: organizationId, workspace_id: workspaceId, user_id: userId, metric: "post_scheduled", quantity: 6, is_demo: true })
    .execute();
}
