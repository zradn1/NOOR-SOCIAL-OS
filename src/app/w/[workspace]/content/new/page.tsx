import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/access-denied";
import { PageHeader } from "@/components/ui/page-header";
import { EditorForWorkspace } from "@/features/content/editor-page";
import { permits, requireWorkspace } from "@/server/auth/context";

export const metadata: Metadata = { title: "New post" };

export default async function NewPostPage({ params }: PageProps<"/w/[workspace]/content/new">) {
  const { workspace } = await params;
  const ctx = await requireWorkspace(workspace);
  return (
    <div className="space-y-8">
      <PageHeader
        title="New post"
        breadcrumbs={[{ label: "Content Studio", href: `/w/${ctx.workspace.slug}/content` }, { label: "New post" }]}
      />
      {permits(ctx, "content.create") ? <EditorForWorkspace ctx={ctx} post={null} /> : <AccessDenied permission="content.create" what="the editor" />}
    </div>
  );
}
