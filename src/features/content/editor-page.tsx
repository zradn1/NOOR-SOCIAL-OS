import type { ComponentProps } from "react";
import { permits, type WorkspaceContext } from "@/server/auth/context";
import { listDestinations, listMediaLibrary, storageConfigured, type PostDetail } from "@/server/services/content";
import { addDays, formatInZone, todayIn, utcToZoned, zoneAbbreviation } from "@/lib/time/zoned";
import { PostEditor } from "./post-editor";

/** Server wrapper that loads everything the editor needs. */
export async function EditorForWorkspace({
  ctx,
  post,
  initial,
}: {
  ctx: WorkspaceContext;
  post: PostDetail | null;
  initial?: ComponentProps<typeof PostEditor>["initial"];
}) {
  const tz = ctx.workspace.timezone;
  const now = new Date();
  const [destinations, library] = await Promise.all([listDestinations(ctx), listMediaLibrary(ctx)]);
  return (
    <PostEditor
      slug={ctx.workspace.slug}
      post={post}
      destinations={destinations}
      library={library}
      storageEnabled={storageConfigured()}
      isDemo={ctx.workspace.isDemo}
      timezone={tz}
      zoneLabel={`${tz.replaceAll("_", " ")} (${zoneAbbreviation(tz, now)})`}
      defaultScheduleDate={addDays(todayIn(tz, now), 1)}
      plannedLocal={post?.plannedFor ? utcToZoned(post.plannedFor, tz) : null}
      scheduledLabel={
        post?.scheduledAt
          ? formatInZone(post.scheduledAt, tz, { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
          : null
      }
      initial={initial}
      permissions={{
        edit: permits(ctx, "content.edit"),
        schedule: permits(ctx, "content.schedule"),
        retry: permits(ctx, "publishing.retry"),
        delete: permits(ctx, "content.delete"),
      }}
    />
  );
}
