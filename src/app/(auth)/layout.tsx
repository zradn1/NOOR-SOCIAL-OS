import Link from "next/link";
import { NoorLogo } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative isolate hidden overflow-hidden border-r border-line bg-sunken lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_80%_70%_at_30%_40%,#000_20%,transparent_75%)]" />
          <div className="absolute top-1/2 -left-[20rem] size-[42rem] -translate-y-1/2">
            <div className="eclipse animate-orbit absolute inset-0" />
          </div>
          <div className="animate-breathe absolute top-1/2 left-[14rem] h-[30rem] w-72 -translate-y-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgb(217_191_143/0.16),transparent)] blur-2xl" />
          <div className="grain absolute inset-0" />
        </div>
        <Link href="/" className="relative w-fit rounded-md">
          <NoorLogo />
        </Link>
        <div className="relative max-w-md space-y-6">
          <p className="font-display text-[3.25rem] leading-[1] tracking-[-0.02em] text-fg">
            Every channel,
            <br />
            <em className="text-champagne pr-1">one quiet command centre.</em>
          </p>
          <p className="text-sm leading-relaxed text-fg-secondary">
            Plan, schedule, and measure across Instagram, TikTok, Facebook, YouTube, LinkedIn, X, and Pinterest, with
            every number labelled by where it came from.
          </p>
        </div>
        <p className="relative text-xs text-fg-faint">Powered by Noor Studio Agency</p>
      </aside>
      <main className="relative isolate flex items-center justify-center overflow-hidden px-4 py-12 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(201_164_106/0.09),transparent)]"
        />
        <div className="w-full max-w-sm space-y-8">
          <Link href="/" className="block w-fit rounded-md lg:hidden">
            <NoorLogo />
          </Link>
          <div className="edge-light relative rounded-[1.5rem] bg-surface/60 p-6 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.9)] sm:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
