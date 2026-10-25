import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/access-denied";
import { InvitationsCard, OrganizationMembersTable } from "@/features/settings/members";
import { OrganizationNameForm } from "@/features/settings/settings-forms";
import { permits, requireWorkspace } from "@/server/auth/context";
import { listOrganizationMembers, listPendingInvitations } from "@/server/services/members";
import { listAccessibleWorkspaces } from "@/server/services/organizations";

export const metadata: Metadata = { title: "Organization" };

export default async function OrganizationSettingsPage({ params }: PageProps<"/w/[workspace]/settings/organization">) {
  const { workspace } = await params;
  const ctx = await requireWorkspace(workspace);
  if (!permits(ctx, "org.members")) return <AccessDenied permission="org.members" what="organization settings" />;
  const [members, invitations, workspaces] = await Promise.all([
    listOrganizationMembers(ctx),
    listPendingInvitations(ctx),
    listAccessibleWorkspaces(ctx.identity),
  ]);
  return (
    <>
      <OrganizationNameForm slug={ctx.workspace.slug} name={ctx.organization.name} />
      <OrganizationMembersTable slug={ctx.workspace.slug} members={members} currentUserId={ctx.user.id} actorRole={ctx.orgRole} />
      <InvitationsCard
        slug={ctx.workspace.slug}
        invitations={invitations}
        actorRole={ctx.orgRole}
        workspaces={workspaces
          .filter((w) => w.organizationId === ctx.organization.id)
          .map((w) => ({ id: w.id, name: w.isDemo ? `${w.name} (demo)` : w.name }))}
      />
    </>
  );
}
