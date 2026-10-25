import { CalendarClock, Info, Link2, PenSquare, Sparkles, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FreshnessIndicator, DataSourceBadge } from "@/components/data/data-source-badge";
import { StatTile } from "@/components/data/stat-tile";
import { PlatformBadgeIcon, PlatformIcon } from "@/components/platform/platform-icon";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { ConnectionStatusBadge } from "@/features/accounts/connection-status";
import { AudienceCharts, PlatformComparison } from "@/features/dashboard/dashboard-charts";
import { FilterBar, parsePlatforms, parseRange } from "@/features/dashboard/range-filter";
import { CreateDemoWorkspaceButton } from "@/features/demo/create-demo-button";
import { presetRange, RANGE_PRESETS } from "@/lib/analytics/aggregate";
import { PLATFORM_LIMITATIONS } from "@/lib/platforms/metrics";
import { PLATFORM_META, PLATFORMS } from "@/lib/platforms/registry";
import { formatInZone, todayIn, zoneAbbreviation } from "@/lib/time/zoned";
import { formatCompact, formatPercent } from "@/lib/utils/format";
import { permits, requireWorkspace } from "@/server/auth/context";
import { getAnalyticsOverview, getPublishingOutcomes, getTopPosts, getUpcomingPosts } from "@/server/services/analytics";
import { listSocialAccounts } from "@/server/services/social-accounts";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ params, searchParams }: PageProps<"/w/[workspace]/dashboard">) {
  const { workspace } = await params;
  const query = await searchParams;
  const ctx = await requireWorkspace(workspace);
  const tz = ctx.workspace.timezone;
  const now = new Date();
  const preset = parseRange(query.range);
  const platforms = parsePlatforms(query.platforms);
  const range = presetRange(preset, todayIn(tz, now));
  const days = RANGE_PRESETS[preset];
  const base = `/w/${ctx.workspace.slug}`;
  const canCreateDemo = permits(ctx, "demo.manage") && !ctx.isClientGuest;

  const [accounts, overview, upcoming, topPosts, outcomes] = await Promise.all([
    listSocialAccounts(ctx),
    getAnalyticsOverview(ctx, range, platforms),
    getUpcomingPosts(ctx, 6),
    getTopPosts(ctx, range, 5),
    getPublishingOutcomes(ctx, new Date(now.getTime() - days * 86_400_000)),
  ]);

  const isDemo = ctx.workspace.isDemo;
  const available = [...new Set(accounts.map((a) => a.platform))];
  const visibleAccounts = platforms ? accounts.filter((a) => platforms.includes(a.platform)) : accounts;
  const { current, prior, provenance } = overview;
  const period = `vs previous ${days} days`;
  const noData = !overview.hasData;

  const followerTotals = overview.followerSeries.map((p) => ({ date: p.date, total: p.total }));
  const followerByPlatform = overview.followerSeries.map((p) => ({ date: p.date, ...p.byPlatform }));
  const chartPlatforms = PLATFORMS.filter((p) => overview.followerSeries.some((s) => typeof s.byPlatform[p] === "number"));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={ctx.organization.name}
        title={ctx.workspace.name}
        description={`Performance across ${visibleAccounts.length} account${visibleAccounts.length === 1 ? "" : "s"}. Times shown in ${tz.replaceAll("_", " ")} (${zoneAbbreviation(tz, now)}).`}
        meta={
          <>
            <DataSourceBadge source={provenance} />
            {overview.latestCapturedAt ? <FreshnessIndicator capturedAt={overview.latestCapturedAt} now={now} /> : null}
          </>
        }
        actions={
          permits(ctx, "content.create") ? (
            <Button asChild>
              <Link href={`${base}/content/new`}>
                <PenSquare /> Create post
              </Link>
            </Button>
          ) : null
        }
      />

      <FilterBar basePath={`${base}/dashboard`} range={preset} platforms={platforms} available={available} />

      {noData && !isDemo ? (
        <Card>
          <CardHeader
            eyebrow="Getting started"
            title="No metrics yet"
            description="NOOR never invents numbers. Metrics appear once an account is connected through an official integration or you import a platform export."
          />
          <CardContent className={cn("grid gap-4", canCreateDemo ? "md:grid-cols-3" : "md:grid-cols-2")}>
            <div className="space-y-2 rounded-md border border-line bg-sunken p-4">
              <Link2 aria-hidden="true" className="size-4 text-gold-300" />
              <p className="text-[13px] font-medium text-fg">Add accounts</p>
              <p className="text-xs leading-relaxed text-fg-muted">
                Official integrations aren&apos;t available in this build yet. Track accounts manually to import analytics.
              </p>
              <Button asChild size="sm" variant="secondary">
                <Link href={`${base}/accounts`}>Social accounts</Link>
              </Button>
            </div>
            <div className="space-y-2 rounded-md border border-line bg-sunken p-4">
              <PenSquare aria-hidden="true" className="size-4 text-gold-300" />
              <p className="text-[13px] font-medium text-fg">Plan content</p>
              <p className="text-xs leading-relaxed text-fg-muted">Draft posts with platform-specific validation and plan them on the calendar.</p>
              <Button asChild size="sm" variant="secondary">
                <Link href={`${base}/content`}>Content Studio</Link>
              </Button>
            </div>
            {canCreateDemo ? (
              <div className="space-y-2 rounded-md border border-demo-line bg-demo-wash p-4">
                <Sparkles aria-hidden="true" className="size-4 text-demo" />
                <p className="text-[13px] font-medium text-fg">Explore with demo data</p>
                <p className="text-xs leading-relaxed text-fg-muted">A separate, clearly labelled workspace with simulated accounts and metrics.</p>
                <CreateDemoWorkspaceButton slug={ctx.workspace.slug} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Followers"
          value={current.followersEnd}
          source={noData ? "unavailable" : provenance}
          delta={current.followerGrowth !== null ? { value: current.followerGrowth, period: `in the last ${days} days` } : null}
          unavailableReason="No account in this selection reports followers yet."
        />
        <StatTile
          label="Reach"
          value={current.reach}
          source={current.reach === null ? "unavailable" : provenance}
          delta={current.reach !== null && prior.reach !== null ? { value: current.reach - prior.reach, period } : null}
          unavailableReason="None of the selected platforms report reach (TikTok, YouTube, X, and Pinterest don't)."
        />
        <StatTile
          label="Engagements"
          value={current.engagements}
          source={current.engagements === null ? "unavailable" : provenance}
          delta={current.engagements !== null && prior.engagements !== null ? { value: current.engagements - prior.engagements, period } : null}
          unavailableReason="No engagement metrics reported for this selection."
        />
        <StatTile
          label={`Engagement rate${current.engagementRate.basis ? ` (by ${current.engagementRate.basis})` : ""}`}
          value={current.engagementRate.value}
          format="percent"
          source={current.engagementRate.value === null ? "unavailable" : provenance}
          delta={
            current.engagementRate.value !== null && prior.engagementRate.value !== null
              ? { value: current.engagementRate.value - prior.engagementRate.value, period }
              : null
          }
          unavailableReason="Needs both engagements and an exposure metric (reach, views, or impressions)."
        />
      </section>

      <AudienceCharts totals={followerTotals} byPlatform={followerByPlatform} platforms={chartPlatforms} provenance={provenance} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <PlatformComparison
          provenance={provenance}
          items={overview.byPlatform
            .sort((a, b) => PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform))
            .map((p) => ({ platform: p.platform, rate: p.summary.engagementRate.value, basis: p.summary.engagementRate.basis }))}
        />
        <Card>
          <CardHeader
            title="Connected accounts"
            description={`${accounts.length} in this workspace`}
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href={`${base}/accounts`}>Manage</Link>
              </Button>
            }
          />
          <CardContent>
            {accounts.length === 0 ? (
              <EmptyState compact icon={Link2} title="No accounts" description="Add accounts on the Social Accounts page." />
            ) : (
              <ul className="divide-y divide-line">
                {accounts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <PlatformBadgeIcon platform={a.platform} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-fg">{a.displayName}</p>
                      <FreshnessIndicator capturedAt={a.lastSyncedAt} now={now} />
                    </div>
                    <ConnectionStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Upcoming posts"
            description={`Scheduled, shown in ${zoneAbbreviation(tz, now)}`}
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href={`${base}/calendar`}>Calendar</Link>
              </Button>
            }
          />
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState compact icon={CalendarClock} title="Nothing scheduled" description="Scheduled posts appear here with their target platforms." />
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((p) => (
                  <li key={p.id}>
                    <Link href={`${base}/content/${p.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-90">
                      <div className="w-20 shrink-0 text-xs text-fg-muted tabular">
                        <p className="text-fg-secondary">{formatInZone(p.scheduledAt, tz, { month: "short", day: "numeric" })}</p>
                        <p>{formatInZone(p.scheduledAt, tz, { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      <p className="min-w-0 flex-1 truncate text-[13px] text-fg">{p.title || p.caption || "Untitled post"}</p>
                      <span className="flex shrink-0 gap-1 text-fg-muted">
                        {p.platforms.map((pl) => (
                          <PlatformIcon key={pl} platform={pl} title={PLATFORM_META[pl].name} className="size-3.5" />
                        ))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Best-performing posts"
            description="By engagements in the selected period"
            actions={topPosts.length ? <DataSourceBadge source={topPosts[0]!.source} /> : null}
          />
          <CardContent>
            {topPosts.length === 0 ? (
              <EmptyState
                compact
                icon={Trophy}
                title="No post metrics"
                description="Post-level metrics come from connected or imported accounts. None are available for this period."
              />
            ) : (
              <ol className="divide-y divide-line">
                {topPosts.map((p, i) => (
                  <li key={p.targetId}>
                    <Link href={`${base}/content/${p.postId}`} className="flex items-center gap-3 py-2.5 hover:opacity-90">
                      <span className="w-5 shrink-0 text-xs text-fg-faint tabular">{i + 1}</span>
                      <PlatformIcon platform={p.platform} title={PLATFORM_META[p.platform].name} className="text-fg-muted" />
                      <p className="min-w-0 flex-1 truncate text-[13px] text-fg">{p.title || p.caption}</p>
                      <span className="shrink-0 text-right">
                        <span className="block text-[13px] font-medium text-fg">
                          {p.engagements === null ? "—" : formatCompact(p.engagements)}
                        </span>
                        <span className="block text-2xs text-fg-muted">
                          {p.reach ? `${formatPercent((p.engagements ?? 0) / p.reach)} of reach` : "engagements"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title="Publishing" description={`Last ${days} days`} />
        <CardContent className="grid gap-4 sm:grid-cols-4">
          {[
            { label: "Published (platform-confirmed)", value: outcomes.published, tone: "success" as const },
            { label: "Simulated (demo, not posted)", value: outcomes.simulated, tone: "demo" as const },
            { label: "Failed or blocked", value: outcomes.failed, tone: "danger" as const },
            { label: "Queued", value: outcomes.queued, tone: "info" as const },
          ].map((s) => (
            <div key={s.label} className="space-y-1.5">
              <p className="text-2xl font-semibold text-fg">{s.value}</p>
              <Badge tone={s.tone}>{s.label}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {available.length ? (
        <Alert tone="neutral" title="Platform limitations">
          <ul className="mt-1 space-y-1">
            {PLATFORMS.filter((p) => available.includes(p)).map((p) => (
              <li key={p} className="flex gap-2">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-fg-faint" />
                <span>
                  <span className="text-fg-secondary">{PLATFORM_META[p].name}:</span> {PLATFORM_LIMITATIONS[p]}
                </span>
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}
