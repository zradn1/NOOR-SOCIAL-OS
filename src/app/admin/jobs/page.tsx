import type { Metadata } from "next";
import { PlatformIcon } from "@/components/platform/platform-icon";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PLATFORM_META } from "@/lib/platforms/registry";
import { formatRelative } from "@/lib/utils/format";
import { requirePlatformAdmin } from "@/server/admin/access";
import { listProblemJobs } from "@/server/services/admin";

export const metadata: Metadata = { title: "Failed jobs" };

export default async function AdminJobsPage() {
  await requirePlatformAdmin();
  const jobs = await listProblemJobs();
  const now = new Date();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Failed and blocked jobs"
        description="Across all workspaces. Workspace editors retry from their own Publishing page; outcomes the platform couldn't confirm are never retried automatically."
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Workspace</TH>
              <TH>Platform</TH>
              <TH>Status</TH>
              <TH>Error</TH>
              <TH className="text-right">Updated</TH>
            </tr>
          </THead>
          <TBody>
            {jobs.length === 0 ? (
              <TR>
                <TD colSpan={5} className="py-8 text-center text-fg-muted">
                  No failed or blocked jobs.
                </TD>
              </TR>
            ) : (
              jobs.map((j) => (
                <TR key={j.id}>
                  <TD>
                    <p className="text-fg">
                      {j.workspace} {j.isDemo ? <Badge tone="demo">demo</Badge> : null}
                    </p>
                    <p className="text-xs text-fg-muted">{j.organization}</p>
                  </TD>
                  <TD>
                    <span className="inline-flex items-center gap-1.5">
                      <PlatformIcon platform={j.platform} className="text-fg-muted" /> {PLATFORM_META[j.platform].name}
                    </span>
                  </TD>
                  <TD>
                    <Badge tone={j.status === "failed" ? "danger" : "warning"}>{j.status}</Badge>
                    <span className="ml-1.5 text-xs text-fg-muted">{j.attempts} attempt{j.attempts === 1 ? "" : "s"}</span>
                  </TD>
                  <TD className="max-w-md">
                    {j.errorCode ? <p className="font-mono text-xs text-fg-secondary">{j.errorCode}</p> : null}
                    {j.lastError ? <p className="line-clamp-2 text-xs text-fg-muted">{j.lastError}</p> : null}
                  </TD>
                  <TD className="text-right text-xs text-fg-muted">{formatRelative(j.updatedAt, now)}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
