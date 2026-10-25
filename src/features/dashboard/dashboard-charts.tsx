"use client";

import { BarListChart } from "@/components/charts/bar-list-chart";
import { TimeSeriesChart, type TimePoint } from "@/components/charts/time-series-chart";
import { DataSourceBadge } from "@/components/data/data-source-badge";
import { PlatformIcon } from "@/components/platform/platform-icon";
import type { MetricProvenance } from "@/lib/analytics/data-source";
import { PLATFORM_META, PLATFORMS, VIZ_SINGLE_SERIES, type Platform } from "@/lib/platforms/registry";

export function AudienceCharts({
  totals,
  byPlatform,
  platforms,
  provenance,
}: {
  totals: TimePoint[];
  byPlatform: TimePoint[];
  platforms: Platform[];
  provenance: MetricProvenance;
}) {
  const ordered = PLATFORMS.filter((p) => platforms.includes(p));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <TimeSeriesChart
        title="Audience growth"
        description="Total followers across selected accounts"
        data={totals}
        series={[{ key: "total", label: "Followers", color: VIZ_SINGLE_SERIES }]}
        badge={<DataSourceBadge source={provenance} />}
        emptyMessage="No follower data for this period."
      />
      <TimeSeriesChart
        title="Followers by platform"
        description="Each platform keeps its color across the product"
        data={byPlatform}
        series={ordered.map((p) => ({ key: p, label: PLATFORM_META[p].name, color: PLATFORM_META[p].vizColor }))}
        badge={<DataSourceBadge source={provenance} />}
        emptyMessage="No follower data for this period."
      />
    </div>
  );
}

export function PlatformComparison({
  items,
  provenance,
}: {
  items: { platform: Platform; rate: number | null; basis: string | null }[];
  provenance: MetricProvenance;
}) {
  return (
    <BarListChart
      title="Engagement rate by platform"
      description="Engagements ÷ reach (or views where reach isn't reported)"
      format="percent"
      badge={<DataSourceBadge source={provenance} />}
      items={items.map((i) => ({
        key: i.platform,
        label: PLATFORM_META[i.platform].name,
        icon: <PlatformIcon platform={i.platform} className="text-fg-muted" />,
        value: i.rate,
        note: "Not reported",
      }))}
    />
  );
}
