import type { Platform } from "./registry";

/** Normalized metric columns in analytics_snapshots. */
export const METRICS = [
  "followers",
  "impressions",
  "reach",
  "views",
  "profile_views",
  "likes",
  "comments",
  "shares",
  "saves",
  "clicks",
  "watch_time_seconds",
] as const;
export type Metric = (typeof METRICS)[number];

/** Metrics that count interactions; summed into "engagements". */
export const ENGAGEMENT_METRICS = ["likes", "comments", "shares", "saves"] as const satisfies readonly Metric[];

export const METRIC_LABEL: Record<Metric, string> = {
  followers: "Followers",
  impressions: "Impressions",
  reach: "Reach",
  views: "Views",
  profile_views: "Profile visits",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
  clicks: "Clicks",
  watch_time_seconds: "Watch time",
};

type Availability = { label?: string; note?: string };

/**
 * Which normalized metrics each platform's official API can provide, with the
 * platform's own name where it differs. A metric absent here is "unavailable"
 * for that platform and is shown as such, never as zero. Availability also
 * depends on account type and granted permissions.
 */
export const PLATFORM_METRICS: Record<Platform, Partial<Record<Metric, Availability>>> = {
  instagram: {
    followers: {},
    reach: {},
    views: { note: "Instagram now reports views; impressions are no longer reported for most content." },
    profile_views: {},
    likes: {},
    comments: {},
    shares: {},
    saves: {},
  },
  tiktok: {
    followers: {},
    views: { label: "Video views" },
    likes: {},
    comments: {},
    shares: {},
  },
  facebook: {
    followers: {},
    reach: {},
    views: { label: "Page views" },
    likes: { label: "Reactions" },
    comments: {},
    shares: {},
    clicks: {},
  },
  youtube: {
    followers: { label: "Subscribers" },
    views: {},
    likes: {},
    comments: {},
    shares: {},
    watch_time_seconds: {},
  },
  linkedin: {
    followers: {},
    impressions: {},
    reach: { label: "Unique impressions", note: "Available for organization pages." },
    likes: { label: "Reactions" },
    comments: {},
    shares: { label: "Reposts" },
    clicks: {},
  },
  x: {
    followers: {},
    impressions: { note: "Depends on the X API access tier." },
    likes: {},
    comments: { label: "Replies" },
    shares: { label: "Reposts" },
    clicks: { label: "Link clicks", note: "Depends on the X API access tier." },
  },
  pinterest: {
    followers: {},
    impressions: {},
    saves: {},
    clicks: { label: "Outbound clicks" },
    views: { label: "Video views" },
  },
};

export function isMetricAvailable(platform: Platform, metric: Metric) {
  return metric in PLATFORM_METRICS[platform];
}

export function metricLabel(platform: Platform, metric: Metric) {
  return PLATFORM_METRICS[platform][metric]?.label ?? METRIC_LABEL[metric];
}

export const PLATFORM_LIMITATIONS: Record<Platform, string> = {
  instagram: "Insights require a professional account. Metrics are delayed by up to 48 hours.",
  tiktok: "Account metrics come from the Display/Business APIs; reach is not provided.",
  facebook: "Page insights only; personal profiles are not supported.",
  youtube: "Impressions and reach are not available through the YouTube Analytics API.",
  linkedin: "Analytics are available for organization pages with approved API access.",
  x: "Engagement metrics depend on the API access tier purchased for the app.",
  pinterest: "Analytics require a Pinterest business account.",
};
