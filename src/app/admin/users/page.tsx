import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SuspendUserDialog } from "@/features/admin/admin-dialogs";
import { formatRelative } from "@/lib/utils/format";
import { requirePlatformAdmin } from "@/server/admin/access";
import { listUsers } from "@/server/services/admin";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requirePlatformAdmin();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const users = await listUsers({ q: query });
  const now = new Date();
  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Accounts across all organizations. Passwords and tokens are never visible here." />
      <form role="search" className="max-w-sm">
        <label htmlFor="user-search" className="sr-only">
          Search users
        </label>
        <Input id="user-search" name="q" defaultValue={query} placeholder="Search by email or name" />
      </form>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>User</TH>
              <TH>Status</TH>
              <TH className="text-right">Organizations</TH>
              <TH className="hidden md:table-cell">Last sign-in</TH>
              <TH className="text-right">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {users.length === 0 ? (
              <TR>
                <TD colSpan={5} className="py-8 text-center text-fg-muted">
                  No users match.
                </TD>
              </TR>
            ) : (
              users.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <p className="text-fg">{u.fullName || u.email}</p>
                    <p className="text-xs text-fg-muted">{u.email}</p>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      {u.suspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>}
                      {!u.confirmed ? <Badge tone="warning">Unconfirmed</Badge> : null}
                      {u.isPlatformAdmin ? <Badge tone="gold">Platform admin</Badge> : null}
                    </div>
                  </TD>
                  <TD className="text-right tabular-nums">{u.organizations}</TD>
                  <TD className="hidden text-xs text-fg-muted md:table-cell">{u.lastSignInAt ? formatRelative(u.lastSignInAt, now) : "Never"}</TD>
                  <TD className="text-right">
                    {u.id === admin.id || u.isPlatformAdmin ? null : <SuspendUserDialog userId={u.id} email={u.email} suspended={u.suspended} />}
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
