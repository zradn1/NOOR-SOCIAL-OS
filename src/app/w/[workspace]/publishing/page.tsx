import { Activity, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge } from "@/components/demo/demo-indicators";
import { PlatformBadgeIcon } from "@/components/platform/platform-icon";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { JobStatusBadge } from "@/features/content/post-status";
import { RetryJobButton } from "@/features/content/retry-button";
import { PLATFORM_META } from "@/lib/platforms/registry";
import { formatInZone, zoneAbbreviation } from "@/lib/time/zoned";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import { permits, requireWorkspace } from "@/server/auth/context";
import { jobCounts, listJobs, workerLastSeen } from "@/server/services/publishing";

export const metadata: Metadata = { title: "Publishing" };

const TABS = [
  { key: "queue", label: "Queue" },
  { key: "problems", label: "Needs attention" },
  { key: "history", label: "History" },
] as const;

export default async function PublishingPage({ params, searchParams }: PageProps<"/w/[workspace]/publishing">) {
  const { workspace } = await params;
  const query = await searchParams;
  const ctx = await requireWorkspace(workspace);
  const tab = TABS.find((t) => t.key === query.tab)?.key ?? "queue";
  const [jobs, counts, lastSeen] = await Promise.all([listJobs(ctx, tab), jobCounts(ctx), workerLastSeen()]);
  const tz = ctx.workspace.timezone;
  const now = new Date();
  const workerActive = lastSeen ? now.getTime() - Date.parse(lastSeen) < 10 * 60_000 : false;
  const base = `/w/${ctx.workspace.slug}/publishing`;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={ctx.workspace.name}
        title="Publishing"
        description="Every scheduled delivery, its attempts, and anything that needs a person. A post counts as published only when the platform confirms it."
        meta={
          <>
            {ctx.workspace.isDemo ? <DemoBadge label="Demo: deliveries are simulated" /> : null}
            <Badge tone={workerActive ? "success" : "warning"}>
              <Activity aria-hidden="true" />
              {workerActive ? `Worker active · ${formatRelative(lastSeen!, now)}` : lastSeen ? `Worker last seen ${formatRelative(lastSeen, now)}` : "No worker detected"}
            </Badge>
          </>
        }
      />

      {!workerActive && counts.queue > 0 ? (
        <Alert tone="warning" title="Scheduled posts aren't being processed">
          No publishing worker or scheduler has run recently. Start <code className="font-mono text-xs">pnpm worker</code> or
          configure a scheduler to call <code className="font-mono text-xs">/api/cron/publishing</code> (see the README).
        </Alert>
      ) : null}

      <nav aria-label="Job status" className="flex gap-5 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 border-b py-2.5 text-[13px] font-medium",
              t.key === tab ? "border-gold-400 text-fg" : "border-transparent text-fg-muted hover:text-fg-secondary",
            )}
          >
            {t.label}
            <span className={cn("rounded-full px-1.5 text-2xs tabular", t.key === "problems" && counts.problems ? "bg-danger-wash text-danger" : "bg-surface-raised text-fg-muted")}>
              {counts[t.key]}
            </span>
          </Link>
        ))}
      </nav>

      <Card>
        {jobs.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Send}
              title={tab === "queue" ? "Nothing queued" : tab === "problems" ? "Nothing needs attention" : "No delivery history yet"}
              description={tab === "queue" ? "Scheduled posts appear here until the worker processes them." : undefined}
            />
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Post</TH>
                <TH>Destination</TH>
                <TH>Status</TH>
                <TH className="hidden md:table-cell">{tab === "queue" ? `Runs at (${zoneAbbreviation(tz, now)})` : "Finished"}</TH>
                <TH className="hidden lg:table-cell">Attempts</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {jobs.map((j) => (
                <TR key={j.id}>
                  <TD className="max-w-sm">
                    <Link href={`/w/${ctx.workspace.slug}/content/${j.postId}`} className="block truncate text-fg hover:text-gold-200">
                      {j.postTitle}
                    </Link>
                    {j.lastError ? <p className="mt-0.5 line-clamp-2 text-xs text-danger">{j.lastError}</p> : null}
                    <p className="mt-0.5 hidden font-mono text-2xs text-fg-faint xl:block">{j.idempotencyKey}</p>
                  </TD>
                  <TD>
                    <span className="flex items-center gap-2">
                      <PlatformBadgeIcon platform={j.platform} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-fg-secondary">{PLATFORM_META[j.platform].name}</span>
                        <span className="block truncate text-xs text-fg-muted">{j.accountName}</span>
                      </span>
                    </span>
                  </TD>
                  <TD>
                    <JobStatusBadge status={j.status} />
                    {j.errorCode ? <p className="mt-1 font-mono text-2xs text-fg-faint">{j.errorCode}</p> : null}
                  </TD>
                  <TD className="hidden text-xs md:table-cell">
                    {formatInZone(tab === "queue" ? j.runAt : (j.completedAt ?? j.runAt), tz, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </TD>
                  <TD className="hidden text-xs lg:table-cell tabular">
                    {j.attempts} / {j.maxAttempts}
                  </TD>
                  <TD className="text-right">
                    {tab === "problems" && permits(ctx, "publishing.retry") ? (
                      <RetryJobButton slug={ctx.workspace.slug} jobId={j.id} unknownOutcome={j.errorCode === "outcome_unknown"} />
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
