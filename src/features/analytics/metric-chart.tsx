"use client";

import { TimeSeriesChart, type TimePoint } from "@/components/charts/time-series-chart";
import { DataSourceBadge } from "@/components/data/data-source-badge";
import type { MetricProvenance } from "@/lib/analytics/data-source";
import { PLATFORM_META, PLATFORMS, VIZ_SINGLE_SERIES, type Platform } from "@/lib/platforms/registry";

export function MetricCharts({
  label,
  totals,
  byPlatform,
  platforms,
  provenance,
  emptyMessage,
}: {
  label: string;
  totals: TimePoint[];
  byPlatform: TimePoint[];
  platforms: Platform[];
  provenance: MetricProvenance;
  emptyMessage: string;
}) {
  const ordered = PLATFORMS.filter((p) => platforms.includes(p));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <TimeSeriesChart
        title={`${label} · total`}
        description="Summed across accounts that report this metric"
        data={totals}
        series={[{ key: "total", label, color: VIZ_SINGLE_SERIES }]}
        badge={<DataSourceBadge source={provenance} />}
        emptyMessage={emptyMessage}
      />
      <TimeSeriesChart
        title={`${label} · by platform`}
        description="Gaps are days without data, not zeros"
        data={byPlatform}
        series={ordered.map((p) => ({ key: p, label: PLATFORM_META[p].name, color: PLATFORM_META[p].vizColor }))}
        badge={<DataSourceBadge source={provenance} />}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
