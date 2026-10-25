import { Check, FileUp, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataSourceBadge, FreshnessIndicator } from "@/components/data/data-source-badge";
import { PlatformBadgeIcon, PlatformIcon } from "@/components/platform/platform-icon";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { ConnectionStatusBadge } from "@/features/accounts/connection-status";
import { MetricCharts } from "@/features/analytics/metric-chart";
import { FilterBar, parsePlatforms, parseRange } from "@/features/dashboard/range-filter";
import { presetRange, RANGE_PRESETS } from "@/lib/analytics/aggregate";
import { METRIC_LABEL, METRICS, PLATFORM_METRICS, isMetricAvailable, metricLabel, type Metric } from "@/lib/platforms/metrics";
import { PLATFORM_META, PLATFORMS } from "@/lib/platforms/registry";
import { todayIn } from "@/lib/time/zoned";
import { cn } from "@/lib/utils/cn";
import { formatCompact, formatPercent } from "@/lib/utils/format";
import { permits, requireWorkspace } from "@/server/auth/context";
import { getAnalyticsOverview, getMetricSeries } from "@/server/services/analytics";
import { listSocialAccounts } from "@/server/services/social-accounts";

export const metadata: Metadata = { title: "Analytics" };

const EXPLORABLE: (Metric | "engagements")[] = ["followers", "reach", "views", "impressions", "engagements", "likes", "comments", "shares", "saves", "clicks", "watch_time_seconds"];

function parseMetric(value: unknown): Metric | "engagements" {
  return EXPLORABLE.includes(value as Metric) ? (value as Metric) : "followers";
}

export default async function AnalyticsPage({ params, searchParams }: PageProps<"/w/[workspace]/analytics">) {
  const { workspace } = await params;
  const query = await searchParams;
  const ctx = await requireWorkspace(workspace);
  const now = new Date();
  const preset = parseRange(query.range);
  const platforms = parsePlatforms(query.platforms);
  const metric = parseMetric(query.metric);
  const range = presetRange(preset, todayIn(ctx.workspace.timezone, now));
  const base = `/w/${ctx.workspace.slug}/analytics`;

  const [accounts, overview, series] = await Promise.all([
    listSocialAccounts(ctx),
    getAnalyticsOverview(ctx, range, platforms),
    getMetricSeries(ctx, range, platforms, metric),
  ]);
  const available = PLATFORMS.filter((p) => accounts.some((a) => a.platform === p));
  const selected = platforms ?? available;
  const label = metric === "engagements" ? "Engagements" : METRIC_LABEL[metric];
  const reportedBy = metric === "engagements" ? selected : selected.filter((p) => isMetricAvailable(p, metric));
  const totals = series.series.map((p) => ({ date: p.date, total: p.total }));
  const byPlatform = series.series.map((p) => ({ date: p.date, ...p.byPlatform }));
  const chartPlatforms = PLATFORMS.filter((p) => series.series.some((s) => typeof s.byPlatform[p] === "number"));
  const metricHref = (m: string) => {
    const qs = new URLSearchParams({ range: preset, metric: m });
    if (platforms) qs.set("platforms", platforms.join(","));
    return `${base}?${qs}`;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={ctx.workspace.name}
        title="Analytics"
        description={`${RANGE_PRESETS[preset]}-day view. Every series states its source; metrics a platform doesn't report are marked unavailable rather than zero.`}
        meta={<DataSourceBadge source={overview.provenance} />}
        actions={
          permits(ctx, "analytics.import") && !ctx.workspace.isDemo ? (
            <Button asChild variant="secondary">
              <Link href={`${base}/import`}>
                <FileUp /> Import metrics
              </Link>
            </Button>
          ) : null
        }
      />

      <FilterBar basePath={base} range={preset} platforms={platforms} available={available} />

      <nav aria-label="Metric" className="flex flex-wrap gap-1.5">
        {EXPLORABLE.map((m) => {
          const lbl = m === "engagements" ? "Engagements" : METRIC_LABEL[m];
          const supported = m === "engagements" || selected.some((p) => isMetricAvailable(p, m));
          return (
            <Link
              key={m}
              href={metricHref(m)}
              aria-current={m === metric ? "true" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3 text-xs transition-colors",
                m === metric ? "border-gold-400/40 bg-gold-wash text-gold-200" : "border-line text-fg-muted hover:text-fg",
                !supported && "opacity-50",
              )}
            >
              {lbl}
            </Link>
          );
        })}
      </nav>

      {reportedBy.length === 0 && selected.length > 0 ? (
        <Alert tone="neutral" title={`${label} is unavailable for the selected platforms`}>
          None of {selected.map((p) => PLATFORM_META[p].name).join(", ")} report {label.toLowerCase()} through their APIs.
        </Alert>
      ) : null}

      <MetricCharts
        label={label}
        totals={totals}
        byPlatform={byPlatform}
        platforms={chartPlatforms}
        provenance={series.provenance}
        emptyMessage={reportedBy.length ? "No data for this period." : "Not reported by the selected platforms."}
      />

      <Card>
        <CardHeader title="By platform" description="Period totals for the selected range" />
        <Table className="mt-4">
          <THead>
            <tr>
              <TH>Platform</TH>
              <TH>Source</TH>
              <TH className="text-right">Followers</TH>
              <TH className="text-right">Growth</TH>
              <TH className="text-right">Reach</TH>
              <TH className="text-right">Views</TH>
              <TH className="text-right">Engagements</TH>
              <TH className="text-right">Eng. rate</TH>
            </tr>
          </THead>
          <TBody>
            {overview.byPlatform.length === 0 ? (
              <TR>
                <TD colSpan={8} className="py-8 text-center text-fg-muted">
                  No metrics for this selection.
                </TD>
              </TR>
            ) : (
              overview.byPlatform
                .sort((a, b) => PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform))
                .map(({ platform, summary, provenance }) => {
                  const cell = (v: number | null, m: Metric) =>
                    isMetricAvailable(platform, m) ? (v === null ? "—" : formatCompact(v)) : (
                      <Tooltip content={`${PLATFORM_META[platform].name} doesn't report ${METRIC_LABEL[m].toLowerCase()}.`}>
                        <span tabIndex={0} className="cursor-help text-fg-faint">n/a</span>
                      </Tooltip>
                    );
                  return (
                    <TR key={platform}>
                      <TD>
                        <span className="flex items-center gap-2 text-fg">
                          <PlatformIcon platform={platform} className="text-fg-muted" /> {PLATFORM_META[platform].name}
                        </span>
                      </TD>
                      <TD>
                        <DataSourceBadge source={provenance} />
                      </TD>
                      <TD className="text-right">{cell(summary.followersEnd, "followers")}</TD>
                      <TD className={cn("text-right", (summary.followerGrowth ?? 0) > 0 && "text-success", (summary.followerGrowth ?? 0) < 0 && "text-danger")}>
                        {summary.followerGrowth === null ? "—" : `${summary.followerGrowth > 0 ? "+" : ""}${formatCompact(summary.followerGrowth)}`}
                      </TD>
                      <TD className="text-right">{cell(summary.reach, "reach")}</TD>
                      <TD className="text-right">{cell(summary.views, "views")}</TD>
                      <TD className="text-right">{summary.engagements === null ? "—" : formatCompact(summary.engagements)}</TD>
                      <TD className="text-right">
                        {summary.engagementRate.value === null ? "—" : (
                          <span title={`by ${summary.engagementRate.basis}`}>{formatPercent(summary.engagementRate.value)}</span>
                        )}
                      </TD>
                    </TR>
                  );
                })
            )}
          </TBody>
        </Table>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader title="Data sources" description="Where each account's numbers come from, and how fresh they are" />
          <CardContent>
            {accounts.length === 0 ? (
              <p className="text-[13px] text-fg-muted">No accounts yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {accounts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <PlatformBadgeIcon platform={a.platform} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-fg">{a.displayName}</p>
                      {a.status === "manual" ? (
                        <p className="text-xs text-fg-muted">{a.latestMetricDate ? `Imported through ${a.latestMetricDate}` : "No imports yet"}</p>
                      ) : (
                        <FreshnessIndicator capturedAt={a.lastSyncedAt} now={now} />
                      )}
                    </div>
                    <ConnectionStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Metric definitions" description="What each platform's official API provides. Availability also depends on account type and permissions." />
          <div className="relative overflow-x-auto px-2 pb-4 scrollbar-thin">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead>
                <tr>
                  <th className="eyebrow px-3 py-2 font-medium">Metric</th>
                  {PLATFORMS.map((p) => (
                    <th key={p} className="px-2 py-2 text-center" scope="col">
                      <PlatformIcon platform={p} title={PLATFORM_META[p].name} className="mx-auto size-3.5 text-fg-muted" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {METRICS.map((m) => (
                  <tr key={m}>
                    <th scope="row" className="px-3 py-2 font-normal text-fg-secondary">
                      {METRIC_LABEL[m]}
                    </th>
                    {PLATFORMS.map((p) => {
                      const info = PLATFORM_METRICS[p][m];
                      return (
                        <td key={p} className="px-2 py-2 text-center">
                          {info ? (
                            <Tooltip content={`${PLATFORM_META[p].name}: ${metricLabel(p, m)}${info.note ? `. ${info.note}` : ""}`}>
                              <span tabIndex={0} className="inline-grid cursor-help place-items-center">
                                <Check aria-label="Available" className={cn("size-3.5", info.note ? "text-warning" : "text-success")} />
                              </span>
                            </Tooltip>
                          ) : (
                            <Minus aria-label="Not available" className="mx-auto size-3.5 text-fg-faint" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 pt-3 text-2xs text-fg-faint">Amber checks carry a caveat; hover for details.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
