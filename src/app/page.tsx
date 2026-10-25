import { ArrowRight, BarChart3, CalendarClock, FlaskConical, ShieldCheck, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { NoorLogo } from "@/components/brand/logo";
import { PlatformIcon } from "@/components/platform/platform-icon";
import { Button } from "@/components/ui/button";
import { PLATFORMS, PLATFORM_META } from "@/lib/platforms/registry";

const PILLARS = [
  {
    icon: CalendarClock,
    title: "Plan and schedule",
    body: "A content studio with per-platform validation and a time-zone-aware calendar for every client.",
  },
  {
    icon: BarChart3,
    title: "Measure honestly",
    body: "Every number is labelled as demo, imported, or platform-verified, with its freshness. Unavailable means unavailable.",
  },
  {
    icon: Users,
    title: "Built for agencies",
    body: "Client workspaces, explicit access, five roles, and an audit trail for every administrative change.",
  },
  {
    icon: Sparkles,
    title: "AI that stays in its lane",
    body: "Captions, hooks, hashtags, and campaign plans, with provider keys kept on the server.",
  },
];

export default function Home() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-64 left-1/2 size-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(201_164_106/0.10),transparent_60%)]"
      />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-8">
        <NoorLogo />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Get started</Link>
          </Button>
        </nav>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 sm:px-8">
        <section className="animate-fade-in py-20 text-center sm:py-28">
          <p className="eyebrow mb-6">The social operating system by Noor Studio</p>
          <h1 className="mx-auto max-w-4xl font-display text-[3rem] leading-[1.02] text-fg sm:text-[4.75rem]">
            Every channel, in <span className="text-gold-300 italic">one light.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-fg-muted">
            NOOR SOCIAL OS brings planning, publishing, analytics, and AI assistance for your brands and clients into
            one calm, precise workspace.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Create your workspace <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
          <ul className="mt-14 flex flex-wrap items-center justify-center gap-x-7 gap-y-3" aria-label="Supported platforms">
            {PLATFORMS.map((p) => (
              <li key={p} className="flex items-center gap-2 text-[13px] text-fg-muted">
                <PlatformIcon platform={p} className="text-silver-300" /> {PLATFORM_META[p].name}
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
              <Icon aria-hidden="true" className="size-5 text-gold-300" />
              <h2 className="mt-4 text-[15px] font-medium text-fg">{title}</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{body}</p>
            </div>
          ))}
        </section>

        <section className="mb-20 grid gap-6 rounded-xl border border-line bg-sunken p-8 sm:grid-cols-[auto_1fr] sm:items-center sm:p-10">
          <div className="grid size-12 place-items-center rounded-full border border-demo-line bg-demo-wash">
            <FlaskConical aria-hidden="true" className="size-5 text-demo" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-fg">Explore before you connect</h2>
            <p className="max-w-3xl text-sm leading-relaxed text-fg-muted">
              A clearly marked demo workspace shows the full product with simulated data. Real accounts connect only
              through each platform&apos;s official authorization. We never ask for your social media passwords, and we
              never mark a post as published until the platform confirms it.
            </p>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-fg-faint sm:px-8">
          <span>© 2026 Noor Studio Agency</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" /> Row-level tenant isolation · Encrypted platform tokens
          </span>
        </div>
      </footer>
    </div>
  );
}
