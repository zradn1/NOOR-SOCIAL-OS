import { ENGAGEMENT_METRICS, type Metric } from "@/lib/platforms/metrics";
import type { Platform } from "@/lib/platforms/registry";
import { addDays, type LocalDate } from "@/lib/time/zoned";
import type { DataSource, MetricProvenance } from "./data-source";

/**
 * Pure aggregation over analytics snapshots. Rules:
 * - A missing value is null ("not available"), never zero.
 * - Stock metrics (followers) carry forward per account; flow metrics
 *   (reach, likes, …) are summed only over accounts that reported them.
 */
export type SnapshotRow = {
  accountId: string;
  platform: Platform;
  date: LocalDate;
  source: DataSource;
  capturedAt: string;
  metrics: Partial<Record<Metric, number | null>>;
};

export type DateRange = { from: LocalDate; to: LocalDate };

export const RANGE_PRESETS = { "7d": 7, "30d": 30, "90d": 90 } as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

export function presetRange(preset: RangePreset, today: LocalDate): DateRange {
  return { from: addDays(today, -(RANGE_PRESETS[preset] - 1)), to: today };
}

export function rangeLength(range: DateRange) {
  return Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** The equally long period immediately before `range`. */
export function previousRange(range: DateRange): DateRange {
  const len = rangeLength(range);
  return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
}

export function datesIn(range: DateRange): LocalDate[] {
  return Array.from({ length: rangeLength(range) }, (_, i) => addDays(range.from, i));
}

const STOCK_METRICS = new Set<Metric>(["followers"]);

export function engagementsOf(metrics: SnapshotRow["metrics"]): number | null {
  let total: number | null = null;
  for (const m of ENGAGEMENT_METRICS) {
    const v = metrics[m];
    if (typeof v === "number") total = (total ?? 0) + v;
  }
  return total;
}

function valueOf(row: SnapshotRow, metric: Metric | "engagements"): number | null {
  if (metric === "engagements") return engagementsOf(row.metrics);
  const v = row.metrics[metric];
  return typeof v === "number" ? v : null;
}

export type SeriesPoint = { date: LocalDate; total: number | null; byPlatform: Partial<Record<Platform, number | null>> };

/** One point per day; `rows` may include days before the range for carry-forward. */
export function dailySeries(rows: SnapshotRow[], range: DateRange, metric: Metric | "engagements"): SeriesPoint[] {
  const stock = metric !== "engagements" && STOCK_METRICS.has(metric);
  const byDate = new Map<LocalDate, SnapshotRow[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);

  const lastKnown = new Map<string, { platform: Platform; value: number }>();
  if (stock) {
    for (const r of [...rows].filter((r) => r.date < range.from).sort((a, b) => a.date.localeCompare(b.date))) {
      const v = valueOf(r, metric);
      if (v !== null) lastKnown.set(r.accountId, { platform: r.platform, value: v });
    }
  }

  return datesIn(range).map((date) => {
    const todays = byDate.get(date) ?? [];
    const byPlatform: Partial<Record<Platform, number | null>> = {};
    let total: number | null = null;
    if (stock) {
      for (const r of todays) {
        const v = valueOf(r, metric);
        if (v !== null) lastKnown.set(r.accountId, { platform: r.platform, value: v });
      }
      for (const { platform, value } of lastKnown.values()) {
        byPlatform[platform] = (byPlatform[platform] ?? 0) + value;
        total = (total ?? 0) + value;
      }
    } else {
      for (const r of todays) {
        const v = valueOf(r, metric);
        if (v === null) continue;
        byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + v;
        total = (total ?? 0) + v;
      }
    }
    return { date, total, byPlatform };
  });
}

/** Sum of a flow metric over the range; null when no account reported it. */
export function sumMetric(rows: SnapshotRow[], range: DateRange, metric: Metric | "engagements"): number | null {
  let total: number | null = null;
  for (const r of rows) {
    if (r.date < range.from || r.date > range.to) continue;
    const v = valueOf(r, metric);
    if (v !== null) total = (total ?? 0) + v;
  }
  return total;
}

export type EngagementRate = { value: number | null; basis: "reach" | "views" | "impressions" | null };

/**
 * Engagements divided by the best available exposure metric. Daily reach is
 * summed across the period, so this approximates (and slightly understates)
 * a rate over unique reach.
 */
export function engagementRate(rows: SnapshotRow[], range: DateRange): EngagementRate {
  const engagements = sumMetric(rows, range, "engagements");
  if (engagements === null) return { value: null, basis: null };
  for (const basis of ["reach", "views", "impressions"] as const) {
    const exposure = sumMetric(
      rows.filter((r) => typeof r.metrics[basis] === "number"),
      range,
      basis,
    );
    if (exposure && exposure > 0) {
      const engagedWithBasis = sumMetric(rows.filter((r) => typeof r.metrics[basis] === "number"), range, "engagements") ?? 0;
      return { value: engagedWithBasis / exposure, basis };
    }
  }
  return { value: null, basis: null };
}

export type PeriodSummary = {
  followersStart: number | null;
  followersEnd: number | null;
  followerGrowth: number | null;
  reach: number | null;
  impressions: number | null;
  views: number | null;
  engagements: number | null;
  engagementRate: EngagementRate;
};

export function summarize(rows: SnapshotRow[], range: DateRange): PeriodSummary {
  const followers = dailySeries(rows, range, "followers");
  const start = followers.find((p) => p.total !== null)?.total ?? null;
  const end = [...followers].reverse().find((p) => p.total !== null)?.total ?? null;
  return {
    followersStart: start,
    followersEnd: end,
    followerGrowth: start !== null && end !== null ? end - start : null,
    reach: sumMetric(rows, range, "reach"),
    impressions: sumMetric(rows, range, "impressions"),
    views: sumMetric(rows, range, "views"),
    engagements: sumMetric(rows, range, "engagements"),
    engagementRate: engagementRate(rows, range),
  };
}

export function provenanceOf(rows: Pick<SnapshotRow, "source">[]): MetricProvenance {
  const sources = new Set(rows.map((r) => r.source));
  if (sources.size === 0) return "unavailable";
  if (sources.size > 1) return "mixed";
  return [...sources][0]!;
}

/** Change between periods; null when either side is unavailable. */
export function delta(current: number | null, previous: number | null) {
  return current === null || previous === null ? null : current - previous;
}
