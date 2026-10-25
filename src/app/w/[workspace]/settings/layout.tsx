import { PageHeader } from "@/components/ui/page-header";
import { SettingsTabs } from "@/features/settings/settings-tabs";
import { permits, requireWorkspace } from "@/server/auth/context";

export default async function SettingsLayout({ children, params }: LayoutProps<"/w/[workspace]/settings">) {
  const { workspace } = await params;
  const ctx = await requireWorkspace(workspace);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Workspace details, who has access, your organization, and your profile."
      />
      <SettingsTabs showOrganization={permits(ctx, "org.members")} showAudit={permits(ctx, "org.audit.view")} />
      <div className="space-y-6">{children}</div>
    </div>
  );
}
