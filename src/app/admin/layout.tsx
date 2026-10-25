import { ArrowLeft, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { NoorLogo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/states";
import { NavTabs } from "@/components/ui/tabs";
import { requirePlatformAdmin } from "@/server/admin/access";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · NOOR" }, robots: { index: false } };

const TABS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/organizations", label: "Organizations" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/jobs", label: "Failed jobs" },
  { href: "/admin/audit", label: "Audit log" },
];

async function AdminShell({ children }: { children: ReactNode }) {
  const admin = await requirePlatformAdmin();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[88rem] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6 lg:px-10">
          <NoorLogo />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger-wash px-2.5 py-1 text-xs text-danger">
            <ShieldAlert aria-hidden="true" className="size-3.5" /> Platform admin · every action is audited
          </span>
          <div className="ml-auto flex items-center gap-4 text-xs text-fg-muted">
            <span className="hidden sm:inline">{admin.email}</span>
            <a href="/app" className="inline-flex items-center gap-1 text-fg-secondary hover:text-fg">
              <ArrowLeft aria-hidden="true" className="size-3.5" /> Back to app
            </a>
          </div>
        </div>
        <div className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-10">
          <NavTabs items={TABS} className="border-b-0" />
        </div>
      </header>
      <main className="mx-auto max-w-[88rem] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[88rem] space-y-4 px-4 py-10 sm:px-6 lg:px-10" aria-busy="true">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
