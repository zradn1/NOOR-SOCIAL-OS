import type { Metadata } from "next";
import { DeleteWorkspaceCard, WorkspaceSettingsForm } from "@/features/settings/settings-forms";
import { listTimeZones } from "@/lib/time/timezones";
import { permits, requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage({ params }: PageProps<"/w/[workspace]/settings">) {
  const { workspace } = await params;
  const ctx = await requireWorkspace(workspace);
  return (
    <>
      <WorkspaceSettingsForm
        slug={ctx.workspace.slug}
        name={ctx.workspace.name}
        timezone={ctx.workspace.timezone}
        description={ctx.workspace.description ?? ""}
        zones={listTimeZones()}
        canEdit={permits(ctx, "workspace.manage")}
      />
      {permits(ctx, "org.clients") ? (
        <DeleteWorkspaceCard slug={ctx.workspace.slug} name={ctx.workspace.name} isDemo={ctx.workspace.isDemo} />
      ) : null}
    </>
  );
}
