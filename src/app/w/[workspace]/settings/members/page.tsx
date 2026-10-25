import type { Metadata } from "next";
import { ClientGuestsCard } from "@/features/clients/client-guests";
import { WorkspaceAccessTable } from "@/features/settings/members";
import { permits, requireWorkspace } from "@/server/auth/context";
import { listClientGuests } from "@/server/services/clients";
import { listWorkspaceAccess } from "@/server/services/members";
import { planHasFeature } from "@/server/services/plan-limits";

export const metadata: Metadata = { title: "Workspace access" };

export default async function WorkspaceMembersPage({ params }: PageProps<"/w/[workspace]/settings/members">) {
  const { workspace } = await params;
  const ctx = await requireWorkspace(workspace);
  const isClient = ctx.workspace.kind === "client" && !ctx.workspace.isDemo;
  const [rows, guests, guestsAllowed] = await Promise.all([
    listWorkspaceAccess(ctx),
    isClient ? listClientGuests(ctx) : null,
    isClient ? planHasFeature(ctx.organization.id, "client_roles") : false,
  ]);
  const canManage = permits(ctx, "workspace.members") && !ctx.isClientGuest;
  return (
    <div className="space-y-6">
      <WorkspaceAccessTable
        slug={ctx.workspace.slug}
        rows={rows.filter((r) => !r.isClientGuest)}
        canManage={canManage}
        currentUserId={ctx.user.id}
      />
      {guests ? (
        <ClientGuestsCard
          slug={ctx.workspace.slug}
          workspaceName={ctx.workspace.name}
          guests={guests.guests}
          invitations={guests.invitations}
          canManage={canManage}
          canInvite={guestsAllowed}
        />
      ) : null}
    </div>
  );
}
