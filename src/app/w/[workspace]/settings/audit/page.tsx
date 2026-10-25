import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shell/access-denied";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatRelative } from "@/lib/utils/format";
import { permits, requireWorkspace } from "@/server/auth/context";
import { listOrganizationAudit } from "@/server/services/audit";
import { planHasFeature } from "@/server/services/plan-limits";

export const metadata: Metadata = { title: "Audit log" };

export default async function OrganizationAuditPage({ params }: PageProps<"/w/[workspace]/settings/audit">) {
  const { workspace } = await params;
  const ctx = await requireWorkspace(workspace);
  if (!permits(ctx, "org.audit.view")) return <AccessDenied permission="org.audit.view" what="the audit log" />;
  if (!(await planHasFeature(ctx.organization.id, "audit_log"))) {
    return (
      <Alert
        tone="neutral"
        title="The audit log is part of the Pro and Agency plans"
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href={`/w/${ctx.workspace.slug}/billing`}>See plans</Link>
          </Button>
        }
      >
        Actions are still recorded on every plan; upgrading makes the history visible here.
      </Alert>
    );
  }
  const entries = await listOrganizationAudit(ctx);
  const now = new Date();
  return (
    <Card>
      <CardHeader title="Audit log" description="Security-relevant actions in this organization, newest first. Entries can't be edited or deleted." />
      <Table className="mt-4">
        <THead>
          <tr>
            <TH>Action</TH>
            <TH>By</TH>
            <TH className="hidden md:table-cell">Workspace</TH>
            <TH className="text-right">When</TH>
          </tr>
        </THead>
        <TBody>
          {entries.length === 0 ? (
            <TR>
              <TD colSpan={4} className="py-8 text-center text-fg-muted">
                Nothing recorded yet.
              </TD>
            </TR>
          ) : (
            entries.map((e) => (
              <TR key={e.id}>
                <TD className="font-mono text-xs text-fg">{e.action}</TD>
                <TD className="text-xs">
                  {e.actorType === "user" ? (e.actor ?? "Former member") : <Badge tone="neutral">{e.actorType === "platform_admin" ? "Noor Studio support" : "System"}</Badge>}
                </TD>
                <TD className="hidden text-xs text-fg-muted md:table-cell">{e.workspace ?? "Organization"}</TD>
                <TD className="text-right text-xs text-fg-muted">{formatRelative(e.createdAt, now)}</TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </Card>
  );
}
