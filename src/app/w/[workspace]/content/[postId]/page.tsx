import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EditorForWorkspace } from "@/features/content/editor-page";
import { requireWorkspace } from "@/server/auth/context";
import { getPost } from "@/server/services/content";

export const metadata: Metadata = { title: "Edit post" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function EditPostPage({ params }: PageProps<"/w/[workspace]/content/[postId]">) {
  const { workspace, postId } = await params;
  const ctx = await requireWorkspace(workspace);
  if (!UUID.test(postId)) notFound();
  const post = await getPost(ctx, postId);
  if (!post || post.status === undefined) notFound();
  return (
    <div className="space-y-8">
      <PageHeader
        title={post.title || "Untitled post"}
        breadcrumbs={[{ label: "Content Studio", href: `/w/${ctx.workspace.slug}/content` }, { label: post.title || "Post" }]}
      />
      <EditorForWorkspace key={`${post.id}:${post.revision}:${post.status}`} ctx={ctx} post={post} />
    </div>
  );
}
