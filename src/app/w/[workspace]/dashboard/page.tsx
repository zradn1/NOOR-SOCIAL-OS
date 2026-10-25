import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: PageProps<"/w/[workspace]/dashboard">) {
  const { workspace } = await params;
  const ctx = await requireWorkspace(workspace);
  return (
    <PageHeader
      eyebrow={ctx.organization.name}
      title={ctx.workspace.name}
      description="Your workspace overview."
      meta={<Badge tone="silver">{ROLE_LABEL[ctx.role]}</Badge>}
    />
  );
}
