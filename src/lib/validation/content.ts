import { z } from "zod";
import { normalizeHashtags } from "@/lib/platforms/constraints";
import { isLocalDate, isLocalTime } from "@/lib/time/zoned";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v?.trim() ? v : null));

export const postInputSchema = z.object({
  id: z.uuid().optional(),
  expectedRevision: z.number().int().positive().optional(),
  title: z
    .string()
    .trim()
    .max(120, "Titles can be at most 120 characters.")
    .optional()
    .transform((v) => v || null),
  caption: z.string().max(70000, "That caption is too long.").default(""),
  hashtags: z
    .array(z.string().max(120))
    .max(60, "Use at most 60 hashtags.")
    .default([])
    .transform((tags) => normalizeHashtags(tags)),
  firstComment: optionalText(2200),
  linkUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), "Enter a full link starting with https://")
    .transform((v) => v || null),
  plannedDate: z
    .string()
    .optional()
    .refine((v) => !v || isLocalDate(v), "Enter a valid date.")
    .transform((v) => v || null),
  plannedTime: z
    .string()
    .optional()
    .refine((v) => !v || isLocalTime(v), "Enter a valid time.")
    .transform((v) => v || null),
  targets: z
    .array(z.object({ accountId: z.uuid(), captionOverride: optionalText(70000) }))
    .max(20)
    .default([]),
  mediaIds: z.array(z.uuid()).max(35).default([]),
  intent: z.enum(["draft", "ready"]).default("draft"),
});
export type PostInput = z.input<typeof postInputSchema>;

export const scheduleSchema = z.object({
  postId: z.uuid(),
  date: z.string().refine(isLocalDate, "Choose a date."),
  time: z.string().refine(isLocalTime, "Choose a time."),
});

export const mediaUrlSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => /^https:\/\/[^\s]+$/i.test(v), "Use a public https:// link to the file."),
  kind: z.enum(["image", "video"]),
  mimeType: z.string().regex(/^(image|video)\/[a-z0-9.+-]+$/, "Choose a file type."),
  width: z.coerce.number().int().min(1).max(20000).optional(),
  height: z.coerce.number().int().min(1).max(20000).optional(),
  durationSeconds: z.coerce.number().min(0).max(43200).optional(),
  altText: z.string().trim().max(1000).optional(),
});

export const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime", "video/webm"]),
  sizeBytes: z.number().int().min(1).max(1_073_741_824),
});
