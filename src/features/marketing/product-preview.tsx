import {
  ArrowUpRight,
  BarChart3,
  Bot,
  Briefcase,
  CalendarDays,
  FlaskConical,
  LayoutDashboard,
  PenSquare,
  Send,
  type LucideIcon,
} from "lucide-react";
import { NoorLogo } from "@/components/brand/logo";
import { PlatformIcon } from "@/components/platform/platform-icon";
import { Badge } from "@/components/ui/badge";
import type { Platform } from "@/lib/platforms/registry";
import { cn } from "@/lib/utils/cn";

// Everything below is an illustration of the dashboard. The numbers are made
// up for the picture and the frame says so ("Demo data" + caption).

const NAV: { icon: LucideIcon; label: string; active?: boolean }[] = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: PenSquare, label: "Content" },
  { icon: CalendarDays, label: "Calendar" },
  { icon: Send, label: "Publishing" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Bot, label: "Assistant" },
  { icon: Briefcase, label: "Clients" },
];

const STATS = [
  { label: "Reach", value: "1.28M", delta: "+12.4%" },
  { label: "Engagement rate", value: "4.9%", delta: "+0.6 pts" },
  { label: "New followers", value: "2.1K", delta: "+18%" },
  { label: "Queued posts", value: "36", delta: "next in 2h" },
];

const UP_NEXT: { platform: Platform; title: string; when: string; status: string }[] = [
  { platform: "instagram", title: "Atelier launch reel", when: "Today · 18:30", status: "Scheduled" },
  { platform: "tiktok", title: "Behind the loom", when: "Tomorrow · 12:00", status: "Scheduled" },
  { platform: "linkedin", title: "Q4 client results", when: "Thu · 09:15", status: "Draft" },
  { platform: "pinterest", title: "Winter palette board", when: "Fri · 17:45", status: "Scheduled" },
];

const REACH = [
  18, 21, 19, 24, 23, 27, 26, 29, 31, 28, 33, 35, 32, 36, 39, 37, 41, 44, 40, 45, 48, 46, 51, 55, 52, 57, 61, 58,
  63, 66,
];

/** Catmull-Rom spline through the points, as an SVG path. */
function smoothPath(values: number[], width: number, height: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - ((v - min) / (max - min)) * height * 0.78 - height * 0.1,
  ]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1] ?? pts[i];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[i + 2] ?? pts[i + 1];
    const c1 = [x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6];
    const c2 = [x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return { line: d, area: `${d} L${width},${height} L0,${height} Z`, last: pts[pts.length - 1] };
}

function ReachChart() {
  const w = 600;
  const h = 180;
  const { line, area, last } = smoothPath(REACH, w, h);
  return (
    <div className="relative min-h-40 flex-1">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id="preview-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#c9a46a" stopOpacity="0.32" />
            <stop offset="1" stopColor="#c9a46a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="#242422" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill="url(#preview-area)" />
        <path d={line} fill="none" stroke="#d9bf8f" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="absolute size-2.5 -translate-1/2 rounded-full border-2 border-surface bg-gold-100 shadow-[0_0_12px_rgb(243_233_214/0.8)]"
        style={{ left: `${(last[0] / w) * 100}%`, top: `${(last[1] / h) * 100}%` }}
      />
    </div>
  );
}

export function ProductPreview({ className }: { className?: string }) {
  return (
    <figure className={cn("relative", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-16 -top-16 bottom-1/3 bg-[radial-gradient(ellipse_55%_55%_at_50%_0%,rgb(201_164_106/0.2),transparent_70%)] blur-2xl"
      />
      <div
        role="img"
        aria-label="Illustration of the NOOR SOCIAL OS dashboard showing reach, engagement, a 30-day reach chart, and upcoming scheduled posts, with simulated demo data."
        className="edge-light relative rounded-[1.75rem] bg-surface/60 p-1.5 shadow-[0_50px_140px_-40px_rgb(0_0_0/0.95)] sm:p-2"
      >
        <div className="overflow-hidden rounded-[1.35rem] border border-line bg-canvas">
          <div className="flex h-10 items-center gap-3 border-b border-line bg-sunken px-4">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-fg-faint/60" />
              <span className="size-2.5 rounded-full bg-fg-faint/40" />
              <span className="size-2.5 rounded-full bg-fg-faint/25" />
            </div>
            <div className="mx-auto hidden h-6 items-center rounded-md border border-line bg-surface px-3 text-[11px] text-fg-muted sm:flex">
              Maison Noor <span className="px-1.5 text-fg-faint">/</span> Dashboard
            </div>
            <Badge tone="demo" className="ml-auto sm:ml-0">
              <FlaskConical />
              Demo data
            </Badge>
          </div>

          <div className="grid md:grid-cols-[11.5rem_minmax(0,1fr)]">
            <div className="hidden space-y-4 border-r border-line bg-sunken p-3 md:block">
              <div className="px-1.5 pt-1">
                <NoorLogo />
              </div>
              <ul className="space-y-0.5">
                {NAV.map(({ icon: Icon, label, active }) => (
                  <li
                    key={label}
                    className={cn(
                      "relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[12px]",
                      active ? "bg-gradient-to-r from-gold-400/15 to-transparent text-fg" : "text-fg-muted",
                    )}
                  >
                    {active ? <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-gold-300" /> : null}
                    <Icon className={cn("size-3.5", active ? "text-gold-300" : "text-fg-faint")} />
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0 space-y-4 p-4 sm:p-6">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="eyebrow">Overview</p>
                  <p className="font-display text-2xl text-fg sm:text-[1.75rem]">Good evening, Salma</p>
                </div>
                <span className="hidden rounded-full border border-line-strong px-3 py-1 text-[11px] text-fg-secondary sm:inline">
                  Last 30 days
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {STATS.map((s) => (
                  <div key={s.label} className="rounded-xl border border-line bg-surface p-3 sm:p-3.5">
                    <p className="text-[11px] text-fg-muted">{s.label}</p>
                    <p className="mt-2 text-xl font-semibold tracking-tight text-fg sm:text-[1.4rem]">{s.value}</p>
                    <p className="mt-1 flex items-center gap-0.5 text-[11px] text-success">
                      {s.delta.startsWith("+") ? <ArrowUpRight className="size-3" /> : null}
                      <span className={cn(!s.delta.startsWith("+") && "text-fg-muted")}>{s.delta}</span>
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
                <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-medium text-fg-secondary">Reach, all platforms</p>
                    <p className="text-[11px] text-fg-muted">30 days</p>
                  </div>
                  <ReachChart />
                </div>
                <div className="rounded-xl border border-line bg-surface p-3.5">
                  <p className="text-[12px] font-medium text-fg-secondary">Up next</p>
                  <ul className="mt-2.5 space-y-2">
                    {UP_NEXT.map((p) => (
                      <li key={p.title} className="flex items-center gap-2.5 rounded-lg border border-line bg-canvas/60 px-2.5 py-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-raised">
                          <PlatformIcon platform={p.platform} className="size-3.5 text-silver-300" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] text-fg">{p.title}</span>
                          <span className="block text-[11px] text-fg-muted">{p.when}</span>
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px]",
                            p.status === "Draft"
                              ? "border-line-strong text-fg-muted"
                              : "border-gold-400/30 bg-gold-wash text-gold-300",
                          )}
                        >
                          {p.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-5 text-center text-xs text-fg-faint">
        Illustration with simulated demo data. Real workspaces show only verified or imported numbers.
      </figcaption>
    </figure>
  );
}
