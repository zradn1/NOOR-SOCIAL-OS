import { CalendarDays, ChevronLeft, ChevronRight, PenSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/demo/demo-indicators";
import { PlatformIcon } from "@/components/platform/platform-icon";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { CalendarBoard, type BoardItem } from "@/features/calendar/calendar-board";
import { parsePlatforms } from "@/features/dashboard/range-filter";
import { PLATFORM_META, PLATFORMS } from "@/lib/platforms/registry";
import {
  addDays,
  addMonths,
  formatInZone,
  isLocalDate,
  monthGrid,
  startOfMonth,
  todayIn,
  utcToZoned,
  weekDays,
  zoneAbbreviation,
  zonedToUtc,
} from "@/lib/time/zoned";
import { cn } from "@/lib/utils/cn";
import { permits, requireWorkspace } from "@/server/auth/context";
import { getCalendarItems } from "@/server/services/calendar";
import { listSocialAccounts } from "@/server/services/social-accounts";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ params, searchParams }: PageProps<"/w/[workspace]/calendar">) {
  const { workspace } = await params;
  const query = await searchParams;
  const ctx = await requireWorkspace(workspace);
  const tz = ctx.workspace.timezone;
  const now = new Date();
  const today = todayIn(tz, now);
  const view = query.view === "week" ? "week" : "month";
  const anchor = typeof query.date === "string" && isLocalDate(query.date) ? query.date : today;
  const platforms = parsePlatforms(query.platforms);

  const grid = view === "month" ? monthGrid(anchor).flat() : weekDays(anchor);
  const [items, accounts] = await Promise.all([
    getCalendarItems(ctx, grid[0]!, grid[grid.length - 1]!, platforms),
    listSocialAccounts(ctx),
  ]);
  const available = PLATFORMS.filter((p) => accounts.some((a) => a.platform === p));

  const board: BoardItem[] = items.map((i) => {
    const local = utcToZoned(i.at, tz);
    return {
      id: i.id,
      title: i.title || i.caption.slice(0, 60) || "Untitled post",
      status: i.status,
      kind: i.kind,
      date: local.date,
      time: local.time,
      platforms: i.platforms,
    };
  });

  const base = `/w/${ctx.workspace.slug}/calendar`;
  const link = (overrides: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    const merged = { view, date: anchor, platforms: platforms?.join(","), ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    return `${base}?${qs.toString()}`;
  };
  const prev = view === "month" ? addMonths(startOfMonth(anchor), -1) : addDays(anchor, -7);
  const next = view === "month" ? addMonths(startOfMonth(anchor), 1) : addDays(anchor, 7);
  const heading =
    view === "month"
      ? formatInZone(zonedToUtc(startOfMonth(anchor), "12:00", tz), tz, { month: "long", year: "numeric" })
      : `${formatInZone(zonedToUtc(grid[0]!, "12:00", tz), tz, { month: "short", day: "numeric" })} – ${formatInZone(zonedToUtc(grid[6]!, "12:00", tz), tz, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ctx.workspace.name}
        title="Calendar"
        description={`Scheduled, published, and planned posts in ${tz.replaceAll("_", " ")} (${zoneAbbreviation(tz, now)}). Drag a scheduled post or a planned draft to another day to move it.`}
        meta={ctx.workspace.isDemo ? <DemoBadge label="Demo content" /> : null}
        actions={
          permits(ctx, "content.create") ? (
            <Button asChild>
              <Link href={`/w/${ctx.workspace.slug}/content/new`}>
                <PenSquare /> New post
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="icon-sm" aria-label="Previous">
            <Link href={link({ date: prev })}>
              <ChevronLeft />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={link({ date: today })}>Today</Link>
          </Button>
          <Button asChild variant="secondary" size="icon-sm" aria-label="Next">
            <Link href={link({ date: next })}>
              <ChevronRight />
            </Link>
          </Button>
          <h2 className="ml-2 font-display text-2xl text-fg">{heading}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {available.length > 1 ? (
            <div role="group" aria-label="Platforms" className="flex flex-wrap gap-1">
              {available.map((p) => {
                const active = platforms?.includes(p) ?? false;
                const nextSet = active ? (platforms ?? []).filter((x) => x !== p) : [...(platforms ?? []), p];
                return (
                  <Link
                    key={p}
                    href={link({ platforms: nextSet.length ? nextSet.join(",") : undefined })}
                    aria-pressed={active}
                    title={PLATFORM_META[p].name}
                    className={cn(
                      "grid size-8 place-items-center rounded-full border transition-colors",
                      active ? "border-gold-400/40 bg-gold-wash text-gold-200" : "border-line text-fg-muted hover:text-fg",
                    )}
                  >
                    <PlatformIcon platform={p} className="size-3.5" title={PLATFORM_META[p].name} />
                  </Link>
                );
              })}
            </div>
          ) : null}
          <div role="group" aria-label="View" className="inline-flex rounded-lg border border-line bg-sunken p-1">
            {(["month", "week"] as const).map((v) => (
              <Link
                key={v}
                href={link({ view: v })}
                aria-current={v === view ? "true" : undefined}
                className={cn(
                  "inline-flex h-7 items-center rounded-md px-3 text-[13px] font-medium capitalize transition-colors",
                  v === view ? "bg-surface-raised text-fg shadow-[var(--shadow-card)]" : "text-fg-muted hover:text-fg",
                )}
              >
                {v}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <ul className="flex flex-wrap gap-4 text-xs text-fg-muted" aria-label="Legend">
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-info/50 bg-info-wash" /> Scheduled</li>
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-dashed border-line-strong" /> Draft (planned)</li>
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-success/50 bg-success-wash" /> Published</li>
        {ctx.workspace.isDemo ? <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-demo-line bg-demo-wash" /> Simulated (demo)</li> : null}
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-danger/50 bg-danger-wash" /> Needs attention</li>
      </ul>

      <CalendarBoard
        slug={ctx.workspace.slug}
        view={view}
        days={grid}
        month={anchor.slice(0, 7)}
        today={today}
        items={board}
        canSchedule={permits(ctx, "content.schedule")}
        canEdit={permits(ctx, "content.edit")}
        zoneLabel={zoneAbbreviation(tz, now)}
      />

      {board.length === 0 ? (
        <EmptyState
          compact
          icon={CalendarDays}
          title={platforms ? "Nothing for these platforms in this period" : "Nothing planned in this period"}
          description="Schedule a post, or give a draft a planned date to see it here."
        />
      ) : null}
    </div>
  );
}
