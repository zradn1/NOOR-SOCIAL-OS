import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Database,
  FileUp,
  FlaskConical,
  KeyRound,
  RotateCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { PlatformIcon } from "@/components/platform/platform-icon";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_META, type Platform } from "@/lib/platforms/registry";
import { cn } from "@/lib/utils/cn";
import { Spotlight } from "./motion";

// The small pictures inside each card are decorative (aria-hidden); the card's
// title and text carry the meaning.

function BentoCard({
  eyebrow,
  title,
  body,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Spotlight
      className={cn(
        "edge-light reveal relative flex min-h-[22rem] flex-col overflow-hidden rounded-[1.6rem] bg-surface/70",
        className,
      )}
    >
      <div className="relative p-6 sm:p-7">
        <p className="eyebrow text-gold-300">{eyebrow}</p>
        <h3 className="mt-3 text-xl font-medium tracking-tight text-fg">{title}</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-fg-muted">{body}</p>
      </div>
      <div aria-hidden="true" className="relative mt-auto px-6 pb-6 sm:px-7 sm:pb-7">
        {children}
      </div>
    </Spotlight>
  );
}

const CHECKS: { platform: Platform; state: "ok" | "warn" | "error"; note: string }[] = [
  { platform: "instagram", state: "ok", note: "Ready" },
  { platform: "tiktok", state: "warn", note: "Add a video" },
  { platform: "x", state: "error", note: "312 / 280, over by 32" },
  { platform: "linkedin", state: "ok", note: "Ready" },
];

function StudioPicture() {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-line bg-canvas/80 p-4">
        <p className="text-[11px] text-fg-muted">Caption</p>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-secondary">
          The atelier opens its doors this Friday. Hand-finished pieces, made in Marrakech, lit for the season ahead.
          <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-gold-300 align-middle" />
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["#atelier", "#marrakech", "#madebyhand"].map((tag) => (
            <span key={tag} className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-fg-muted">
              {tag}
            </span>
          ))}
        </div>
      </div>
      <ul className="space-y-2">
        {CHECKS.map((c) => (
          <li key={c.platform} className="flex items-center gap-2.5 rounded-xl border border-line bg-canvas/60 px-3 py-2.5">
            <PlatformIcon platform={c.platform} className="size-4 text-silver-300" />
            <span className="text-[12px] text-fg-secondary">{PLATFORM_META[c.platform].name}</span>
            <span
              className={cn(
                "ml-auto flex items-center gap-1 text-[11px]",
                c.state === "ok" && "text-success",
                c.state === "warn" && "text-warning",
                c.state === "error" && "text-danger",
              )}
            >
              {c.state === "ok" ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
              {c.note}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssistantPicture() {
  return (
    <div className="space-y-2.5">
      <p className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md border border-line bg-surface-raised px-3.5 py-2 text-[12px] text-fg-secondary">
        Three hooks for the atelier launch. Warm, confident.
      </p>
      <div className="rounded-2xl rounded-bl-md border border-gold-400/25 bg-gold-wash px-3.5 py-3 text-[12px] leading-relaxed text-fg-secondary">
        <p className="flex items-center gap-1.5 text-[11px] text-gold-300">
          <Sparkles className="size-3.5" /> Example output
        </p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4 marker:text-fg-faint">
          <li>Some things are worth waiting for. Friday, they are worth seeing.</li>
          <li>Made by hand. Lit by Marrakech.</li>
          <li>The doors open at six. Come early.</li>
        </ol>
      </div>
    </div>
  );
}

const WEEK: { day: string; posts: Platform[] }[] = [
  { day: "Mon", posts: ["instagram"] },
  { day: "Tue", posts: ["linkedin", "x"] },
  { day: "Wed", posts: [] },
  { day: "Thu", posts: ["tiktok"] },
  { day: "Fri", posts: ["instagram", "pinterest"] },
  { day: "Sat", posts: ["youtube"] },
  { day: "Sun", posts: [] },
];

function CalendarPicture() {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WEEK.map((d, i) => (
        <div
          key={d.day}
          className={cn(
            "flex min-h-32 flex-col gap-1.5 rounded-lg border border-line bg-canvas/70 p-1",
            i === 4 && "border-gold-400/40 bg-gold-wash",
          )}
        >
          <span className={cn("text-center text-[10px]", i === 4 ? "text-gold-300" : "text-fg-faint")}>{d.day}</span>
          {d.posts.map((p) => (
            <span
              key={p}
              className="grid h-7 place-items-center rounded-md"
              style={{ backgroundColor: `${PLATFORM_META[p].vizColor}2e`, color: PLATFORM_META[p].vizColor }}
            >
              <PlatformIcon platform={p} className="size-3.5" />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function AnalyticsPicture() {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] text-fg-muted">Engagement rate</p>
          <p className="mt-1 text-[2rem] leading-none font-semibold tracking-tight text-fg">4.9%</p>
        </div>
        <svg viewBox="0 0 120 40" className="h-12 w-32">
          <path
            d="M0,34 C12,32 18,26 28,27 C38,28 44,20 54,19 C64,18 70,22 80,15 C90,8 100,11 120,4"
            fill="none"
            stroke="#d9bf8f"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="success">
          <ShieldCheck />
          Platform API
        </Badge>
        <Badge tone="info">
          <FileUp />
          Imported
        </Badge>
        <Badge tone="demo">
          <FlaskConical />
          Demo data
        </Badge>
      </div>
    </div>
  );
}

const CLIENTS = [
  { initials: "MN", name: "Maison Noor", kind: "Internal", role: "Owner" },
  { initials: "AC", name: "Atlas Café", kind: "Client", role: "Editor" },
  { initials: "RL", name: "Riad Lumière", kind: "Client", role: "Client guest" },
];

function ClientsPicture() {
  return (
    <ul className="space-y-2">
      {CLIENTS.map((c) => (
        <li key={c.name} className="flex items-center gap-3 rounded-xl border border-line bg-canvas/70 px-3 py-2.5">
          <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-silver-300 to-silver-700 text-[11px] font-semibold text-canvas">
            {c.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] text-fg">{c.name}</span>
            <span className="block text-[11px] text-fg-muted">{c.kind} workspace</span>
          </span>
          <span className="rounded-full border border-line-strong px-2 py-0.5 text-[10px] text-fg-secondary">{c.role}</span>
        </li>
      ))}
    </ul>
  );
}

const GUARDS = [
  { icon: Database, label: "Row-level isolation", note: "Every table, every query" },
  { icon: KeyRound, label: "Encrypted tokens", note: "AES-256-GCM at rest" },
  { icon: BadgeCheck, label: "Signed webhooks", note: "Verified before use" },
  { icon: ScrollText, label: "Audit trail", note: "Admin changes recorded" },
];

function SecurityPicture() {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {GUARDS.map(({ icon: Icon, label, note }) => (
        <li key={label} className="rounded-xl border border-line bg-canvas/70 p-3">
          <Icon className="size-4 text-gold-300" />
          <p className="mt-2.5 text-[12px] text-fg">{label}</p>
          <p className="text-[11px] text-fg-muted">{note}</p>
        </li>
      ))}
    </ul>
  );
}

const TIMELINE = [
  { icon: Clock, label: "Queued", note: "18:29:58", tone: "text-fg-muted" },
  { icon: RotateCw, label: "Retry scheduled", note: "Rate limited, retrying in 2 min", tone: "text-warning" },
  { icon: CheckCircle2, label: "Published", note: "Confirmed by Instagram with a post id", tone: "text-success" },
];

function PublishingPicture() {
  return (
    <ol className="relative space-y-3 pl-1">
      <span className="absolute top-3 bottom-3 left-[1.15rem] w-px bg-line-strong" />
      {TIMELINE.map(({ icon: Icon, label, note, tone }) => (
        <li key={label} className="relative flex items-start gap-3">
          <span className="relative grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface-raised">
            <Icon className={cn("size-3.5", tone)} />
          </span>
          <span className="pt-1">
            <span className={cn("block text-[12px] font-medium", tone)}>{label}</span>
            <span className="block text-[11px] text-fg-muted">{note}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function FeatureBento() {
  return (
    <section id="features" aria-labelledby="features-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
      <div className="reveal mx-auto max-w-2xl text-center">
        <p className="eyebrow">Features</p>
        <h2 id="features-title" className="mt-4 text-balance font-display text-[2.5rem] leading-[1.02] text-fg sm:text-[3.5rem]">
          Everything a social team runs on, <em className="text-champagne pr-1">beautifully calm.</em>
        </h2>
      </div>
      <div className="mt-14 grid gap-4 md:grid-cols-6">
        <BentoCard
          className="md:col-span-4"
          eyebrow="Content Studio"
          title="Write once. Fit every platform."
          body="Captions, hashtags, media, and per-platform overrides, checked live against each platform's rules before anything is scheduled."
        >
          <StudioPicture />
        </BentoCard>
        <BentoCard
          className="md:col-span-2"
          eyebrow="AI assistant"
          title="Ideas on demand"
          body="Hooks, captions, hashtags, and campaign plans. Keys stay on the server."
        >
          <AssistantPicture />
        </BentoCard>
        <BentoCard
          className="md:col-span-2"
          eyebrow="Calendar"
          title="The week at a glance"
          body="Plan by day or week, in each workspace's own time zone."
        >
          <CalendarPicture />
        </BentoCard>
        <BentoCard
          className="md:col-span-2"
          eyebrow="Analytics"
          title="Numbers with a source"
          body="Each metric says whether it came from a platform, an import, or the demo."
        >
          <AnalyticsPicture />
        </BentoCard>
        <BentoCard
          className="md:col-span-2"
          eyebrow="Clients"
          title="Built for agencies"
          body="Client workspaces, five roles, and guest access limited to what clients need."
        >
          <ClientsPicture />
        </BentoCard>
        <BentoCard
          className="md:col-span-3"
          eyebrow="Security"
          title="Private by construction"
          body="Tenant data is isolated in the database itself, not only in the interface."
        >
          <SecurityPicture />
        </BentoCard>
        <BentoCard
          className="md:col-span-3"
          eyebrow="Publishing"
          title="Honest about every post"
          body="A queue with retries and backoff. A post is published only when the platform says so."
        >
          <PublishingPicture />
        </BentoCard>
      </div>
    </section>
  );
}
