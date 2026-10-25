import { z } from "zod";
import { PLATFORMS, type Platform } from "@/lib/platforms/registry";

export const AI_TASKS = ["ideas", "caption", "hooks", "hashtags", "campaign", "adapt"] as const;
export type AiTask = (typeof AI_TASKS)[number];

export const AI_TASK_META: Record<AiTask, { label: string; shortLabel: string; description: string; briefLabel: string; briefPlaceholder: string; defaultCount: number }> = {
  ideas: {
    label: "Post ideas",
    shortLabel: "Ideas",
    description: "Angles and formats to fill the calendar.",
    briefLabel: "Topic or goal",
    briefPlaceholder: "Autumn collection launch for a candle studio; we want more saves and shop visits.",
    defaultCount: 5,
  },
  caption: {
    label: "Captions",
    shortLabel: "Captions",
    description: "Ready-to-edit captions in your tone.",
    briefLabel: "What the post is about",
    briefPlaceholder: "Behind the scenes of hand-pouring our new amber candle.",
    defaultCount: 3,
  },
  hooks: {
    label: "Hooks",
    shortLabel: "Hooks",
    description: "Opening lines for short video and carousels.",
    briefLabel: "Video or carousel topic",
    briefPlaceholder: "3 mistakes people make when styling a mantelpiece.",
    defaultCount: 6,
  },
  hashtags: {
    label: "Hashtags",
    shortLabel: "Hashtags",
    description: "A focused set, mixing broad and niche tags.",
    briefLabel: "Post topic",
    briefPlaceholder: "Minimal Scandinavian living room makeover.",
    defaultCount: 12,
  },
  campaign: {
    label: "Campaign plan",
    shortLabel: "Campaign",
    description: "A phased plan with posts per platform.",
    briefLabel: "Campaign goal and timing",
    briefPlaceholder: "Two-week launch for a limited holiday gift box, starting 1 December.",
    defaultCount: 8,
  },
  adapt: {
    label: "Adapt for platforms",
    shortLabel: "Adapt",
    description: "Rewrite one caption for each selected platform.",
    briefLabel: "Original caption",
    briefPlaceholder: "Paste the caption you want to adapt.",
    defaultCount: 1,
  },
};

export const AI_TONES = ["warm", "playful", "premium", "bold", "informative", "calm"] as const;

export const aiRequestSchema = z.object({
  task: z.enum(AI_TASKS),
  brief: z.string().trim().min(3, "Describe what you need in a few words.").max(4000, "Keep the brief under 4,000 characters."),
  platforms: z.array(z.enum(PLATFORMS)).max(PLATFORMS.length).default([]),
  tone: z.enum(AI_TONES).default("warm"),
  audience: z.string().trim().max(300).optional().default(""),
  language: z.string().trim().max(40).optional().default("English"),
  count: z.coerce.number().int().min(1).max(15).optional(),
});
export type AiRequest = z.infer<typeof aiRequestSchema>;

/**
 * The shape every task returns. Kept deliberately flat so it works as a
 * structured-output schema and renders with one component.
 */
export const aiOutputSchema = z.object({
  items: z.array(
    z.object({
      title: z.string().nullable().describe("Short heading: idea name, campaign phase, or null"),
      body: z.string().describe("The caption, hook, idea description, or post brief"),
      platform: z.enum(PLATFORMS).nullable().describe("Platform this item is written for, or null if general"),
      hashtags: z.array(z.string()).describe("Hashtags without the # sign; empty when not relevant"),
    }),
  ),
  notes: z.string().nullable().describe("One or two sentences of guidance for the editor, or null"),
});
export type AiOutput = z.infer<typeof aiOutputSchema>;
export type AiItem = AiOutput["items"][number];

const HASHTAG = /^[\p{L}\p{N}_]{1,100}$/u;

/**
 * Normalizes model output before it is stored or shown: trims, caps sizes,
 * drops malformed hashtags, and keeps only platforms that were requested.
 */
export function sanitizeOutput(output: AiOutput, request: Pick<AiRequest, "task" | "platforms" | "count">): AiOutput {
  const max = request.task === "adapt" ? Math.max(1, request.platforms.length) : (request.count ?? AI_TASK_META[request.task].defaultCount);
  const allowed = new Set<Platform>(request.platforms);
  const items = output.items
    .map((item) => ({
      title: item.title?.trim().slice(0, 160) || null,
      body: item.body.trim().slice(0, 5000),
      platform: item.platform && (allowed.size === 0 || allowed.has(item.platform)) ? item.platform : null,
      hashtags: [...new Set(item.hashtags.map((h) => h.trim().replace(/^#+/, "")).filter((h) => HASHTAG.test(h)))].slice(0, 30),
    }))
    .filter((item) => item.body || item.hashtags.length)
    .slice(0, max);
  return { items, notes: output.notes?.trim().slice(0, 600) || null };
}
