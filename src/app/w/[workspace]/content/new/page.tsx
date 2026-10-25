import type { Metadata } from "next";
import { AccessDenied } from "@/components/shell/access-denied";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { EditorForWorkspace } from "@/features/content/editor-page";
import { permits, requireWorkspace } from "@/server/auth/context";
import { getGenerationItem } from "@/server/services/ai";

export const metadata: Metadata = { title: "New post" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewPostPage({ params, searchParams }: PageProps<"/w/[workspace]/content/new">) {
  const { workspace } = await params;
  const query = await searchParams;
  const ctx = await requireWorkspace(workspace);
  const from = typeof query.from === "string" && UUID.test(query.from) ? query.from : null;
  const index = Number(typeof query.item === "string" ? query.item : 0);
  const item = from && Number.isInteger(index) && index >= 0 && index < 50 && permits(ctx, "ai.use") ? await getGenerationItem(ctx, from, index) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="New post"
        breadcrumbs={[{ label: "Content Studio", href: `/w/${ctx.workspace.slug}/content` }, { label: "New post" }]}
      />
      {item?.isDemoOutput ? (
        <Alert tone="demo" title="Started from demo output">
          This text came from the assistant&apos;s demo templates, not an AI model. Edit it before using it.
        </Alert>
      ) : item ? (
        <Alert tone="info" title="Started from the AI Assistant">
          Review and edit the draft. Nothing is scheduled until you choose to.
        </Alert>
      ) : null}
      {permits(ctx, "content.create") ? (
        <EditorForWorkspace
          ctx={ctx}
          post={null}
          initial={item ? { title: item.task === "ideas" || item.task === "campaign" ? (item.title?.slice(0, 120) ?? null) : null, caption: item.body, hashtags: item.hashtags, platform: item.platform } : null}
        />
      ) : (
        <AccessDenied permission="content.create" what="the editor" />
      )}
    </div>
  );
}
