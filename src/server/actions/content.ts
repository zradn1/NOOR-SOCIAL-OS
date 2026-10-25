"use server";

import { sql } from "kysely";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mediaUrlSchema, scheduleSchema, uploadRequestSchema, type PostInput } from "@/lib/validation/content";
import { loadWorkspaceForAction } from "@/server/auth/context";
import { withUser } from "@/server/db/client";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/security/request";
import { recordAudit } from "@/server/services/audit";
import {
  addMediaByUrl,
  confirmMediaUpload,
  createMediaUpload,
  deletePost,
  duplicatePost,
  savePost,
  schedulePost,
  setPostArchived,
  unschedulePost,
} from "@/server/services/content";
import { isLocalDate, isLocalTime } from "@/lib/time/zoned";
import { setPlannedDate } from "@/server/services/calendar";
import { parseInput, runAction } from "./run";

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);

export async function savePostAction(slug: string, input: PostInput) {
  const result = await runAction("content.save", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), input.id ? "content.edit" : "content.create");
    return savePost(ctx, input);
  });
  if (result.ok) refresh();
  return result;
}

export async function duplicatePostAction(slug: string, postId: string) {
  let destination = "";
  const result = await runAction("content.duplicate", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "content.create");
    const id = await duplicatePost(ctx, z.uuid().parse(postId));
    destination = `/w/${ctx.workspace.slug}/content/${id}`;
    return undefined;
  });
  if (result.ok) redirect(destination);
  return result;
}

export async function archivePostAction(slug: string, postId: string, archived: boolean) {
  const result = await runAction(
    "content.archive",
    async () => {
      const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "content.edit");
      await setPostArchived(ctx, z.uuid().parse(postId), archived);
      return undefined;
    },
    archived ? "Post archived. Anything queued for it was cancelled." : "Post restored as a draft.",
  );
  if (result.ok) refresh();
  return result;
}

export async function deletePostAction(slug: string, postId: string) {
  let destination = "";
  const result = await runAction("content.delete", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "content.delete");
    await deletePost(ctx, z.uuid().parse(postId));
    destination = `/w/${ctx.workspace.slug}/content`;
    return undefined;
  });
  if (result.ok) redirect(destination);
  return result;
}

export async function schedulePostAction(slug: string, input: { postId: string; date: string; time: string }) {
  const result = await runAction("content.schedule", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "content.schedule");
    return schedulePost(ctx, parseInput(scheduleSchema, input));
  });
  if (result.ok) refresh();
  return result;
}

export async function unschedulePostAction(slug: string, postId: string) {
  const result = await runAction(
    "content.unschedule",
    async () => {
      const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "content.schedule");
      await unschedulePost(ctx, z.uuid().parse(postId));
      return undefined;
    },
    "Unscheduled. The post is back to ready.",
  );
  if (result.ok) refresh();
  return result;
}

export async function retryJobAction(slug: string, jobId: string) {
  const result = await runAction(
    "publishing.retry",
    async () => {
      const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "publishing.retry");
      const id = z.uuid().parse(jobId);
      await withUser(ctx.identity, (trx) => sql`select app.retry_publishing_job(${id}::uuid)`.execute(trx));
      await recordAudit({
        action: "publishing.retried",
        organizationId: ctx.organization.id,
        workspaceId: ctx.workspace.id,
        actorId: ctx.user.id,
        targetType: "publishing_job",
        targetId: id,
        isDemo: ctx.workspace.isDemo,
        ...(await requestMeta()),
      });
      return undefined;
    },
    "Queued for another attempt.",
  );
  if (result.ok) refresh();
  return result;
}

export async function addMediaByUrlAction(slug: string, input: Record<string, unknown>) {
  return runAction("media.add_url", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "media.upload");
    const media = parseInput(mediaUrlSchema, input);
    await enforceRateLimit("media", ctx.user.id);
    return addMediaByUrl(ctx, media);
  });
}

export async function createUploadAction(slug: string, input: { fileName: string; mimeType: string; sizeBytes: number }) {
  return runAction("media.create_upload", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "media.upload");
    const upload = parseInput(uploadRequestSchema, input);
    await enforceRateLimit("media", ctx.user.id);
    return createMediaUpload(ctx, upload);
  });
}

export async function confirmUploadAction(slug: string, assetId: string) {
  return runAction("media.confirm_upload", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "media.upload");
    await confirmMediaUpload(ctx, z.uuid().parse(assetId));
    return undefined;
  });
}

export async function setPlannedDateAction(slug: string, input: { postId: string; date: string | null; time: string }) {
  const result = await runAction(
    "content.plan",
    async () => {
      const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "content.edit");
      const parsed = parseInput(
        z.object({
          postId: z.uuid(),
          date: z.string().refine(isLocalDate).nullable(),
          time: z.string().refine(isLocalTime),
        }),
        input,
      );
      await setPlannedDate(ctx, parsed.postId, parsed.date, parsed.time);
      return undefined;
    },
    "Planned date updated.",
  );
  if (result.ok) refresh();
  return result;
}
