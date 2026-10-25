import Link from "next/link";
import { after } from "next/server";
import type { ReactNode } from "react";
import { NoorLogo } from "@/components/brand/logo";
import { DemoBanner } from "@/components/demo/demo-indicators";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { isPlatformAdmin, permits, requireWorkspace } from "@/server/auth/context";
import { logger } from "@/server/observability/logger";
import { listNotifications } from "@/server/services/notifications";
import { listAccessibleWorkspaces, rememberWorkspace } from "@/server/services/organizations";
import { getProfile } from "@/server/services/profiles";
import { MobileNav } from "./mobile-nav";
import { buildNavigation } from "./nav-config";
import { SidebarNav } from "./sidebar-nav";
import { NotificationsMenu, UserMenu } from "./topbar-menus";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "./workspace-switcher";

export async function WorkspaceShell({ slug, children }: { slug: string; children: ReactNode }) {
  const ctx = await requireWorkspace(slug);
  const [workspaces, notifications, platformAdmin, profile] = await Promise.all([
    listAccessibleWorkspaces(ctx.identity),
    listNotifications(ctx.identity),
    isPlatformAdmin(ctx.user.id),
    getProfile(ctx.identity),
  ]);

  after(async () => {
    try {
      await rememberWorkspace(ctx.identity, ctx.workspace.id);
    } catch (error) {
      logger.warn("workspace.remember_failed", { error });
    }
  });

  const sections = buildNavigation(slug, (p) => permits(ctx, p), platformAdmin);
  const current: SwitcherWorkspace = workspaces.find((w) => w.id === ctx.workspace.id) ?? {
    ...ctx.workspace,
    organizationName: ctx.organization.name,
  };
  const switcher = (
    <WorkspaceSwitcher current={current} workspaces={workspaces} canCreateWorkspace={permits(ctx, "org.clients")} />
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-[70] rounded-md bg-gold-400 px-3 py-2 text-sm text-gold-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 isolate hidden h-dvh flex-col gap-5 overflow-hidden border-r border-line bg-sunken px-3 py-4 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-24 -z-10 size-80 rounded-full bg-[radial-gradient(closest-side,rgb(201_164_106/0.1),transparent)]"
        />
        <div aria-hidden="true" className="grain pointer-events-none absolute inset-0 -z-10" />
        <Link href={`/w/${slug}/dashboard`} className="w-fit rounded-md px-2 py-1">
          <NoorLogo />
        </Link>
        {switcher}
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <SidebarNav sections={sections} />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-2 pt-3">
          <span className="text-2xs text-fg-faint">Powered by Noor Studio</span>
          <Badge tone="silver">{ROLE_LABEL[ctx.role]}</Badge>
        </div>
      </aside>

      <div className="relative isolate flex min-w-0 flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[28rem] w-full max-w-5xl -translate-x-1/2 bg-[radial-gradient(ellipse_60%_55%_at_50%_0%,rgb(201_164_106/0.07),transparent_70%)]"
        />
        {ctx.workspace.isDemo ? <DemoBanner /> : null}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-canvas/70 px-3 backdrop-blur-xl backdrop-saturate-150 sm:px-6">
          <MobileNav sections={sections} switcher={switcher} />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-[13px] text-fg-muted">
              {ctx.organization.name}
              <span className="px-1.5 text-fg-faint">/</span>
              <span className="text-fg-secondary">{ctx.workspace.name}</span>
            </span>
            {ctx.workspace.kind === "client" ? <Badge tone="silver">Client</Badge> : null}
          </div>
          <NotificationsMenu items={notifications.items} unread={notifications.unread} />
          <UserMenu name={profile.fullName} email={profile.email} profileHref={`/w/${slug}/settings/profile`} />
        </header>
        <main id="main" className="mx-auto w-full max-w-[88rem] flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]" aria-busy="true">
      <aside className="hidden h-dvh flex-col gap-5 border-r border-line bg-sunken px-3 py-4 lg:flex">
        <div className="px-2 py-1">
          <NoorLogo />
        </div>
        <div className="skeleton h-12 w-full" />
        <div className="space-y-2">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="skeleton h-8 w-full opacity-60" />
          ))}
        </div>
      </aside>
      <div>
        <div className="h-14 border-b border-line" />
      </div>
    </div>
  );
}
