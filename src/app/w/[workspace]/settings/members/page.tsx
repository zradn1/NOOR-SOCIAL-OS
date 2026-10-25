import type { Metadata } from "next";
import { WorkspaceAccessTable } from "@/features/settings/members";
import { permits, requireWorkspace } from "@/server/auth/context";
import { listWorkspaceAccess } from "@/server/services/members";

export const metadata: Metadata = { title: "Workspace access" };

export default async function WorkspaceMembersPage({ params }: PageProps<"/w/[workspace]/settings/members">) {
  const { workspace } = await params;
  const ctx = await requireWorkspace(workspace);
  const rows = await listWorkspaceAccess(ctx);
  return (
    <WorkspaceAccessTable
      slug={ctx.workspace.slug}
      rows={rows}
      canManage={permits(ctx, "workspace.members")}
      currentUserId={ctx.user.id}
    />
  );
}
