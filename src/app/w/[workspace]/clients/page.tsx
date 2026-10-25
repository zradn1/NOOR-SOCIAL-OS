import { ArrowUpRight, Briefcase, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/demo/demo-indicators";
import { AccessDenied } from "@/components/shell/access-denied";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { NewWorkspaceDialog } from "@/features/clients/new-workspace-dialog";
import { listTimeZones } from "@/lib/time/timezones";
import { cn } from "@/lib/utils/cn";
import { formatRelative, pluralize } from "@/lib/utils/format";
import { permits, requireWorkspace } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { listWorkspaceOverview, type WorkspaceOverview } from "@/server/services/clients";
import { currentUsage, planHasFeature, planLimit } from "@/server/services/plan-limits";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ params }: PageProps<"/w/[workspace]/clients">) {
  const { workspace } = await params;
  const ctx = await requireWorkspace(workspace);
  if (!permits(ctx, "org.clients")) {
    return (
      <div className="space-y-8">
        <PageHeader title="Clients" />
        <AccessDenied permission="org.clients" what="client management" />
      </div>
    );
  }

  const db = getDb();
  const [overview, clientsAllowed, guestsAllowed, used, limit] = await Promise.all([
    listWorkspaceOverview(ctx),
    planHasFeature(ctx.organization.id, "client_workspaces"),
    planHasFeature(ctx.organization.id, "client_roles"),
    currentUsage(db, ctx.organization.id, "workspaces"),
    planLimit(db, ctx.organization.id, "workspaces"),
  ]);
  const clients = overview.filter((w) => w.kind === "client" && !w.isDemo);
  const brands = overview.filter((w) => w.kind === "internal" || w.isDemo);
  const now = new Date();
  const atLimit = limit !== null && used >= limit;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={ctx.organization.name}
        title="Clients"
        description="Every brand your team runs, who works on it, and what's coming up."
        meta={
          <span className="text-xs text-fg-muted">
            {limit === null ? `${pluralize(used, "workspace")}` : `${used} of ${pluralize(limit, "workspace")} on your plan`}
            {" · demo workspaces don't count"}
          </span>
        }
        actions={
          atLimit ? null : (
            <NewWorkspaceDialog
              slug={ctx.workspace.slug}
              zones={listTimeZones()}
              defaultTimezone={ctx.workspace.timezone}
              clientsAllowed={clientsAllowed}
            />
          )
        }
      />

      {atLimit ? (
        <Alert tone="warning" title="Workspace limit reached">
          Your plan includes {pluralize(limit, "workspace")}. Upgrade on the Billing page to add more.
        </Alert>
      ) : null}

      <section aria-labelledby="clients-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="clients-heading" className="text-[15px] font-medium text-fg">
            Client workspaces
          </h2>
          <p className="text-xs text-fg-muted">
            {guestsAllowed ? "Guests from the client's side see only their own workspace." : "Client guest access is part of the Agency plan."}
          </p>
        </div>
        {!clientsAllowed && clients.length === 0 ? (
          <Alert tone="neutral" title="Client workspaces are part of the Pro and Agency plans">
            Keep each client&apos;s accounts, content, and analytics separate, with team access per client.
          </Alert>
        ) : clients.length === 0 ? (
          <EmptyState icon={Briefcase} title="No clients yet" description="Create a client workspace to keep each brand's accounts, content, and reporting apart." />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {clients.map((w) => (
              <WorkspaceCard key={w.id} workspace={w} now={now} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="brands-heading" className="space-y-4">
        <h2 id="brands-heading" className="text-[15px] font-medium text-fg">
          Your brands
        </h2>
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {brands.map((w) => (
            <WorkspaceCard key={w.id} workspace={w} now={now} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function WorkspaceCard({ workspace: w, now }: { workspace: WorkspaceOverview; now: Date }) {
  const stats = [
    { label: "Accounts", value: w.accounts },
    { label: "Scheduled", value: w.scheduled },
    { label: "Assigned", value: w.assigned },
    ...(w.kind === "client" && !w.isDemo ? [{ label: "Guests", value: w.guests }] : []),
  ];
  return (
    <li>
      <Card className={cn("flex h-full flex-col", w.isDemo && "border-demo-line")}>
        <div className="flex items-start gap-3 p-5 pb-4">
          <Avatar name={w.name} square />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[14px] font-medium text-fg">{w.name}</h3>
              {w.isDemo ? <DemoBadge /> : w.kind === "client" ? <Badge tone="neutral">Client</Badge> : null}
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">{w.description || w.timezone.replaceAll("_", " ")}</p>
          </div>
        </div>
        <dl className="grid grid-cols-4 gap-2 border-y border-line px-5 py-3">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-2xs text-fg-faint">{s.label}</dt>
              <dd className="font-display text-lg tabular-nums text-fg">{s.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <span className="text-xs text-fg-muted">{w.lastActivityAt ? `Active ${formatRelative(w.lastActivityAt, now)}` : "No content yet"}</span>
          <div className="flex gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/w/${w.slug}/settings/members`}>
                <Users /> Access
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/w/${w.slug}/dashboard`}>
                Open <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    </li>
  );
}
