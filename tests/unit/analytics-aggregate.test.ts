import { describe, expect, it } from "vitest";
import {
  dailySeries,
  engagementRate,
  presetRange,
  previousRange,
  provenanceOf,
  summarize,
  sumMetric,
  type SnapshotRow,
} from "@/lib/analytics/aggregate";

const row = (accountId: string, platform: SnapshotRow["platform"], date: string, metrics: SnapshotRow["metrics"], source: SnapshotRow["source"] = "demo"): SnapshotRow => ({
  accountId,
  platform,
  date,
  source,
  capturedAt: `${date}T12:00:00Z`,
  metrics,
});

const range = { from: "2026-10-01", to: "2026-10-03" };

describe("ranges", () => {
  it("builds presets ending today and the previous period", () => {
    expect(presetRange("7d", "2026-10-25")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(previousRange({ from: "2026-10-19", to: "2026-10-25" })).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });
});

describe("daily series", () => {
  it("carries follower counts forward per account and sums across accounts", () => {
    const rows = [
      row("ig", "instagram", "2026-09-30", { followers: 100 }),
      row("tt", "tiktok", "2026-10-01", { followers: 50 }),
      row("ig", "instagram", "2026-10-02", { followers: 110 }),
    ];
    const series = dailySeries(rows, range, "followers");
    expect(series.map((p) => p.total)).toEqual([150, 160, 160]);
    expect(series[1]!.byPlatform).toEqual({ instagram: 110, tiktok: 50 });
  });

  it("leaves days with no reports as null for flow metrics, never zero", () => {
    const rows = [row("ig", "instagram", "2026-10-01", { reach: 40 }), row("ig", "instagram", "2026-10-03", { reach: 60 })];
    expect(dailySeries(rows, range, "reach").map((p) => p.total)).toEqual([40, null, 60]);
  });

  it("ignores unavailable metrics instead of treating them as zero", () => {
    const rows = [row("yt", "youtube", "2026-10-01", { impressions: null, views: 10 })];
    expect(sumMetric(rows, range, "impressions")).toBeNull();
    expect(sumMetric(rows, range, "views")).toBe(10);
  });
});

describe("engagement rate", () => {
  it("prefers reach, and only counts engagements from accounts reporting that basis", () => {
    const rows = [
      row("ig", "instagram", "2026-10-01", { reach: 1000, likes: 40, comments: 5, shares: 3, saves: 2 }),
      row("tt", "tiktok", "2026-10-01", { views: 5000, likes: 400 }),
    ];
    expect(engagementRate(rows, range)).toEqual({ value: 50 / 1000, basis: "reach" });
  });

  it("falls back to views, then impressions, and reports no basis when none exists", () => {
    expect(engagementRate([row("tt", "tiktok", "2026-10-01", { views: 1000, likes: 20 })], range)).toEqual({ value: 0.02, basis: "views" });
    expect(engagementRate([row("x", "x", "2026-10-01", { likes: 20 })], range)).toEqual({ value: null, basis: null });
  });
});

describe("summaries and provenance", () => {
  it("computes follower growth across the range", () => {
    const rows = [row("ig", "instagram", "2026-10-01", { followers: 100 }), row("ig", "instagram", "2026-10-03", { followers: 130 })];
    expect(summarize(rows, range)).toMatchObject({ followersStart: 100, followersEnd: 130, followerGrowth: 30 });
  });

  it("labels data by source and flags mixtures", () => {
    expect(provenanceOf([])).toBe("unavailable");
    expect(provenanceOf([{ source: "demo" }, { source: "demo" }])).toBe("demo");
    expect(provenanceOf([{ source: "manual_import" }, { source: "provider_sync" }])).toBe("mixed");
  });
});
