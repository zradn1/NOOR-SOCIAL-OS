import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import { requirePlatformAdmin } from "@/server/admin/access";
import { listAuditLogs } from "@/server/services/admin";

export const metadata: Metadata = { title: "Audit log" };

const FILTERS = [
  { value: "", label: "All" },
  { value: "admin.", label: "Admin" },
  { value: "billing.", label: "Billing" },
  { value: "member.", label: "Members" },
  { value: "invitation.", label: "Invitations" },
  { value: "client_guest.", label: "Client guests" },
  { value: "account.", label: "Accounts" },
  { value: "workspace.", label: "Workspaces" },
];

function summarize(metadata: Record<string, unknown>) {
  const text = JSON.stringify(metadata);
  return text === "{}" ? "" : text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requirePlatformAdmin();
  const { action } = await searchParams;
  const filter = typeof action === "string" && FILTERS.some((f) => f.value === action) ? action : "";
  const logs = await listAuditLogs({ action: filter || undefined, limit: 200 });
  const now = new Date();
  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Append-only record of security-relevant actions across the platform. IP addresses are stored as keyed hashes." />
      <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/admin/audit?action=${encodeURIComponent(f.value)}` : "/admin/audit"}
            aria-current={f.value === filter ? "true" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-xs transition-colors",
              f.value === filter ? "border-gold-400/40 bg-gold-wash text-gold-200" : "border-line text-fg-muted hover:text-fg",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Action</TH>
              <TH>Actor</TH>
              <TH className="hidden lg:table-cell">Organization</TH>
              <TH className="hidden xl:table-cell">Details</TH>
              <TH className="text-right">When</TH>
            </tr>
          </THead>
          <TBody>
            {logs.length === 0 ? (
              <TR>
                <TD colSpan={5} className="py-8 text-center text-fg-muted">
                  Nothing recorded yet.
                </TD>
              </TR>
            ) : (
              logs.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <span className="font-mono text-xs text-fg">{l.action}</span>
                    {l.isDemo ? <Badge tone="demo" className="ml-1.5">demo</Badge> : null}
                  </TD>
                  <TD className="text-xs">
                    {l.actorType === "user" ? (l.actor ?? "deleted user") : <Badge tone={l.actorType === "platform_admin" ? "danger" : "neutral"}>{l.actorType === "platform_admin" ? `admin · ${l.actor ?? "?"}` : "system"}</Badge>}
                  </TD>
                  <TD className="hidden text-xs text-fg-muted lg:table-cell">{l.organization ?? "—"}</TD>
                  <TD className="hidden max-w-sm truncate font-mono text-2xs text-fg-faint xl:table-cell">{summarize(l.metadata)}</TD>
                  <TD className="text-right text-xs text-fg-muted">{formatRelative(l.createdAt, now)}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
