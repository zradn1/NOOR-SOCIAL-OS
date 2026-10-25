import { ArrowRight, BadgeCheck, FlaskConical, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { NoorLogo, NoorMark } from "@/components/brand/logo";
import { PlatformIcon } from "@/components/platform/platform-icon";
import { Button } from "@/components/ui/button";
import { PLATFORMS, PLATFORM_META } from "@/lib/platforms/registry";
import { LightUpText } from "./motion";

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#features", label: "Features" },
  { href: "#workflow", label: "Workflow" },
  { href: "#trust", label: "Trust" },
];

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="glass mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 rounded-full pr-2 pl-4 sm:pl-5">
        <Link href="/" aria-label="NOOR SOCIAL OS home" className="rounded-full">
          <NoorLogo />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-0.5 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-1.5 text-[13px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="hidden rounded-full min-[400px]:inline-flex">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="rounded-full px-4">
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

/** The lit eclipse behind the hero: grid, turning ring, sunrise bloom, beams, grain. */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="bg-grid mask-radial-top absolute inset-0" />
      <div className="absolute top-[-21rem] left-1/2 size-[42rem] -translate-x-1/2 sm:top-[-31rem] sm:size-[62rem]">
        <div className="eclipse animate-orbit absolute inset-0" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,transparent_82%,rgb(201_164_106/0.07)_96%,transparent)]" />
      </div>
      <div className="animate-breathe absolute top-[17rem] left-1/2 h-48 w-[34rem] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgb(217_191_143/0.28),transparent)] blur-2xl sm:top-[26rem] sm:h-64 sm:w-[52rem]" />
      <div className="mask-fade-b absolute inset-x-0 top-0 h-[40rem]">
        {[
          { left: "14%", delay: "0s" },
          { left: "50%", delay: "2.4s" },
          { left: "86%", delay: "4.6s" },
        ].map((beam) => (
          <span
            key={beam.left}
            className="absolute top-0 h-full w-px bg-gradient-to-b from-transparent via-line-strong to-transparent"
            style={{ left: beam.left }}
          >
            <span
              className="animate-beam absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-transparent via-gold-300 to-transparent"
              style={{ animationDelay: beam.delay }}
            />
          </span>
        ))}
      </div>
      <div className="grain absolute inset-0" />
    </div>
  );
}

const PROMISES = [
  { icon: KeyRound, label: "No social passwords, ever" },
  { icon: BadgeCheck, label: "Published only when the platform confirms" },
  { icon: ShieldCheck, label: "Every number labelled by its source" },
];

export function Hero() {
  return (
    <section className="relative isolate pt-36 pb-14 sm:pt-48 sm:pb-20">
      <HeroBackdrop />
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-8">
        <p className="glass animate-rise mx-auto inline-flex items-center gap-2 rounded-full py-1 pr-3.5 pl-1.5 text-xs text-fg-secondary">
          <NoorMark className="size-5" />
          The social operating system by Noor Studio
        </p>
        <h1 className="mt-7 font-display text-[3.25rem] leading-[0.95] tracking-[-0.025em] text-fg sm:text-[5.5rem] lg:text-[7rem]">
          <span className="animate-rise block [animation-delay:90ms]">Every channel,</span>
          <span className="animate-rise block [animation-delay:200ms]">
            in <em className="text-champagne whitespace-nowrap pr-2">one light.</em>
          </span>
        </h1>
        <p className="animate-rise mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-fg-secondary [animation-delay:320ms] sm:text-base">
          Plan, publish, and measure Instagram, TikTok, Facebook, YouTube, LinkedIn, X, and Pinterest for every brand
          and client, from one calm, precise workspace.
        </p>
        <div className="animate-rise mt-10 flex flex-wrap items-center justify-center gap-3 [animation-delay:420ms]">
          <Button
            asChild
            size="lg"
            className="rounded-full px-6 shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_0_0_1px_rgb(201_164_106/0.5),0_10px_40px_-8px_rgb(201_164_106/0.55)]"
          >
            <Link href="/sign-up">
              Create your workspace <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost" className="glass rounded-full px-6 hover:bg-surface-hover/80">
            <a href="#product">See it in motion</a>
          </Button>
        </div>
        <ul className="animate-rise mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 [animation-delay:520ms]">
          {PROMISES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 text-[13px] text-fg-muted">
              <Icon aria-hidden="true" className="size-4 text-gold-300" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function PlatformMarquee() {
  const items = [...PLATFORMS, ...PLATFORMS];
  return (
    <section aria-labelledby="platforms-title" className="py-16 sm:py-24">
      <h2 id="platforms-title" className="eyebrow text-center">
        Seven platforms, one workspace
      </h2>
      <div className="mask-fade-x mt-7 overflow-hidden">
        <ul className="animate-marquee flex w-max gap-3 pr-3 hover:[animation-play-state:paused]">
          {items.map((p, i) => (
            <li
              key={`${p}-${i}`}
              aria-hidden={i >= PLATFORMS.length ? true : undefined}
              className="glass flex items-center gap-3 rounded-full py-2.5 pr-6 pl-3 text-sm text-fg-secondary"
            >
              <span className="grid size-8 place-items-center rounded-full bg-surface-raised">
                <PlatformIcon platform={p} className="size-4 text-silver-100" />
              </span>
              {PLATFORM_META[p].name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "Connect",
    body: "Link each account through the platform's own sign-in. Tokens are encrypted at rest and never reach the browser.",
  },
  {
    title: "Create",
    body: "Write once, adapt per platform with live rule checks, draft with the assistant, and place it on the calendar.",
  },
  {
    title: "Publish and measure",
    body: "A queue with retries publishes on time. Results come back labelled by where every number came from.",
  },
];

export function WorkflowSteps() {
  return (
    <section id="workflow" aria-labelledby="workflow-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-8 sm:py-24">
      <div className="reveal mx-auto max-w-2xl text-center">
        <p className="eyebrow">Workflow</p>
        <h2 id="workflow-title" className="mt-4 text-balance font-display text-[2.5rem] leading-[1.02] text-fg sm:text-[3.5rem]">
          From idea to <em className="text-champagne">published</em>, in three moves.
        </h2>
      </div>
      <ol className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-6">
        <span
          aria-hidden="true"
          className="metal-edge absolute top-7 right-[16%] left-[16%] hidden h-px md:block"
        />
        {STEPS.map((step, i) => (
          <li key={step.title} className="reveal relative text-center">
            <span className="glass relative mx-auto grid size-14 place-items-center rounded-full font-display text-2xl text-gold-200">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-6 text-lg font-medium text-fg">{step.title}</h3>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-fg-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TrustSection() {
  return (
    <section id="trust" aria-labelledby="trust-title" className="relative isolate overflow-hidden py-24 sm:py-36">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[36rem] w-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgb(201_164_106/0.08),transparent)]"
      />
      <div className="mx-auto max-w-5xl px-4 sm:px-8">
        <h2 id="trust-title" className="eyebrow text-center">
          Our promises
        </h2>
        <LightUpText
          className="mt-8 text-center font-display text-[2rem] leading-[1.12] sm:text-[3.25rem] lg:text-[3.75rem]"
          text="We never ask for your social passwords. Nothing is called published until the platform confirms it. Every number tells you where it came from, and demo data always says demo."
          accent={["passwords", "confirms", "demo"]}
        />
        <div className="reveal relative mt-16 grid gap-6 overflow-hidden rounded-[1.75rem] border border-demo-line bg-sunken p-7 sm:grid-cols-[auto_1fr] sm:items-center sm:p-10">
          <div aria-hidden="true" className="demo-hatch pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative grid size-14 place-items-center rounded-full border border-demo-line bg-demo-wash">
            <FlaskConical aria-hidden="true" className="size-6 text-demo" />
          </div>
          <div className="relative space-y-2">
            <h3 className="text-lg font-medium text-fg">Explore before you connect</h3>
            <p className="max-w-3xl text-sm leading-relaxed text-fg-secondary">
              Every new organization gets a clearly marked demo workspace with simulated accounts, posts, and metrics.
              Nothing in it touches a real platform, and it is labelled on every screen.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="relative isolate overflow-hidden px-4 pt-10 pb-28 sm:px-8 sm:pb-36">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-8 left-1/2 size-[30rem] -translate-x-1/2 sm:size-[40rem]">
          <div className="eclipse animate-orbit absolute inset-0 [animation-direction:reverse]" />
        </div>
        <div className="animate-breathe absolute top-[60%] left-1/2 h-48 w-[40rem] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgb(201_164_106/0.2),transparent)] blur-2xl" />
        <div className="grain absolute inset-0" />
      </div>
      <div className="reveal mx-auto max-w-3xl pt-24 text-center sm:pt-36">
        <h2 id="cta-title" className="text-balance font-display text-[2.75rem] leading-[1] text-fg sm:text-[4.5rem]">
          Bring every channel into <em className="text-champagne whitespace-nowrap pr-1">one light.</em>
        </h2>
        <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-fg-secondary">
          Start with the demo workspace, then connect your first account when you are ready.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button
            asChild
            size="lg"
            className="rounded-full px-6 shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_0_0_1px_rgb(201_164_106/0.5),0_10px_40px_-8px_rgb(201_164_106/0.55)]"
          >
            <Link href="/sign-up">
              Create your workspace <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost" className="glass rounded-full px-6 hover:bg-surface-hover/80">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-sunken">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <NoorLogo />
          <p className="max-w-xs text-sm leading-relaxed text-fg-muted">
            The social media operating system for agencies, businesses, and creators. Powered by Noor Studio
            Agency.
          </p>
        </div>
        <nav aria-label="Product" className="space-y-3">
          <p className="eyebrow">Product</p>
          <ul className="space-y-2 text-sm">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="text-fg-secondary transition-colors hover:text-fg">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Account" className="space-y-3">
          <p className="eyebrow">Account</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/sign-in" className="text-fg-secondary transition-colors hover:text-fg">
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/sign-up" className="text-fg-secondary transition-colors hover:text-fg">
                Create an account
              </Link>
            </li>
            <li>
              <Link href="/forgot-password" className="text-fg-secondary transition-colors hover:text-fg">
                Reset password
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-fg-faint sm:px-8">
          <span>© 2026 Noor Studio Agency</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck aria-hidden="true" className="size-3.5" /> Row-level tenant isolation · Encrypted platform
            tokens
          </span>
        </div>
      </div>
    </footer>
  );
}
