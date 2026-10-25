import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AssignPlanDialog } from "@/features/admin/admin-dialogs";
import { formatRelative } from "@/lib/utils/format";
import { requirePlatformAdmin } from "@/server/admin/access";
import { listOrganizations } from "@/server/services/admin";

export const metadata: Metadata = { title: "Organizations" };

export default async function AdminOrganizationsPage({ searchParams }: PageProps<"/admin/organizations">) {
  await requirePlatformAdmin();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const orgs = await listOrganizations({ q: query });
  const now = new Date();
  return (
    <div className="space-y-6">
      <PageHeader title="Organizations" description="Subscriptions, workspaces, and members across all tenants." />
      <form role="search" className="max-w-sm">
        <label htmlFor="org-search" className="sr-only">
          Search organizations
        </label>
        <Input id="org-search" name="q" defaultValue={query} placeholder="Search by name or slug" />
      </form>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Organization</TH>
              <TH>Plan</TH>
              <TH className="text-right">Workspaces</TH>
              <TH className="text-right">Members</TH>
              <TH className="hidden lg:table-cell">Created</TH>
              <TH className="text-right">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {orgs.length === 0 ? (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-fg-muted">
                  No organizations match.
                </TD>
              </TR>
            ) : (
              orgs.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <p className="text-fg">{o.name}</p>
                    <p className="text-xs text-fg-muted">{o.owner ?? "no owner"}</p>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={o.planId === "free" ? "neutral" : "gold"}>{o.planId}</Badge>
                      <span className="text-xs text-fg-muted">
                        {o.status} · {o.provider}
                      </span>
                    </div>
                  </TD>
                  <TD className="text-right tabular-nums">
                    {o.workspaces}
                    {o.demoWorkspaces ? <span className="text-xs text-demo"> +{o.demoWorkspaces} demo</span> : null}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {o.members}
                    {o.guests ? <span className="text-xs text-fg-muted"> +{o.guests} guests</span> : null}
                  </TD>
                  <TD className="hidden text-xs text-fg-muted lg:table-cell">{formatRelative(o.createdAt, now)}</TD>
                  <TD className="text-right">
                    <AssignPlanDialog organizationId={o.id} organizationName={o.name} planId={o.planId} />
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
