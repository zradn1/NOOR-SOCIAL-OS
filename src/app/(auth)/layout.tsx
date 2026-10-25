import Link from "next/link";
import { NoorLogo } from "@/components/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-sunken lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -left-32 size-[34rem] rounded-full bg-[radial-gradient(circle,rgb(201_164_106/0.12),transparent_65%)]"
        />
        <Link href="/" className="relative w-fit">
          <NoorLogo />
        </Link>
        <div className="relative max-w-md space-y-6">
          <p className="font-display text-[2.75rem] leading-[1.05] text-fg">
            Every channel,
            <br />
            <span className="text-gold-300 italic">one quiet command centre.</span>
          </p>
          <p className="text-sm leading-relaxed text-fg-muted">
            Plan, schedule, and measure across Instagram, TikTok, Facebook, YouTube, LinkedIn, X, and Pinterest,
            with every number labelled by where it came from.
          </p>
        </div>
        <p className="relative text-xs text-fg-faint">Powered by Noor Studio Agency</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          <Link href="/" className="block w-fit lg:hidden">
            <NoorLogo />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
