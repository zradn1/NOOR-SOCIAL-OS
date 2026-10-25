import { PLATFORM_META, type Platform } from "./registry";

/**
 * Publishing rules per platform, used for live validation in the editor and
 * re-checked on the server before scheduling. Values follow each platform's
 * published limits for its official publishing API; re-verify them when the
 * corresponding integration is implemented (see docs/INTEGRATIONS.md).
 */
export type PlatformRules = {
  captionMax: number;
  /** "x-weighted" applies X's weighting (URLs count 23, most CJK/emoji count 2). */
  counting: "codepoints" | "x-weighted";
  captionLabel: string;
  hashtagsMax?: number;
  hashtagsRecommended?: number;
  mentionsMax?: number;
  requiresMedia: boolean;
  mediaKinds: readonly ("image" | "video")[];
  maxMediaItems: number;
  maxVideos: number;
  mixedMedia: boolean;
  videoMaxSeconds?: number;
  title?: { required: boolean; max: number };
  firstComment: boolean;
  links: "clickable" | "not-clickable" | "destination-field";
  notes: string[];
};

export const PLATFORM_RULES: Record<Platform, PlatformRules> = {
  instagram: {
    captionMax: 2200,
    counting: "codepoints",
    captionLabel: "Caption",
    hashtagsMax: 30,
    mentionsMax: 20,
    requiresMedia: true,
    mediaKinds: ["image", "video"],
    maxMediaItems: 10,
    maxVideos: 10,
    mixedMedia: true,
    videoMaxSeconds: 900,
    firstComment: true,
    links: "not-clickable",
    notes: [
      "Publishing requires an Instagram professional (Business or Creator) account.",
      "Links in captions are not clickable.",
      "Carousels hold up to 10 images or videos.",
    ],
  },
  tiktok: {
    captionMax: 2200,
    counting: "codepoints",
    captionLabel: "Caption",
    requiresMedia: true,
    mediaKinds: ["video", "image"],
    maxMediaItems: 35,
    maxVideos: 1,
    mixedMedia: false,
    videoMaxSeconds: 600,
    firstComment: false,
    links: "not-clickable",
    notes: [
      "A post is either one video or a photo post (up to 35 images).",
      "The maximum video length depends on the creator's account; the API reports it before posting.",
      "Unaudited TikTok apps can only post privately until the app passes TikTok's review.",
    ],
  },
  facebook: {
    captionMax: 63206,
    counting: "codepoints",
    captionLabel: "Post text",
    requiresMedia: false,
    mediaKinds: ["image", "video"],
    maxMediaItems: 10,
    maxVideos: 1,
    mixedMedia: false,
    firstComment: true,
    links: "clickable",
    notes: ["Publishing targets Facebook Pages you manage, not personal profiles."],
  },
  youtube: {
    captionMax: 5000,
    counting: "codepoints",
    captionLabel: "Description",
    hashtagsMax: 60,
    hashtagsRecommended: 3,
    requiresMedia: true,
    mediaKinds: ["video"],
    maxMediaItems: 1,
    maxVideos: 1,
    mixedMedia: false,
    title: { required: true, max: 100 },
    firstComment: false,
    links: "clickable",
    notes: [
      "Each upload is one video with a required title.",
      "YouTube ignores all hashtags on a video that has more than 60.",
      "Uploads from unverified API projects are restricted to private visibility.",
    ],
  },
  linkedin: {
    captionMax: 3000,
    counting: "codepoints",
    captionLabel: "Post text",
    requiresMedia: false,
    mediaKinds: ["image", "video"],
    maxMediaItems: 20,
    maxVideos: 1,
    mixedMedia: false,
    firstComment: true,
    links: "clickable",
    notes: ["Organization pages need the Community Management API product approved by LinkedIn."],
  },
  x: {
    captionMax: 280,
    counting: "x-weighted",
    captionLabel: "Post",
    requiresMedia: false,
    mediaKinds: ["image", "video"],
    maxMediaItems: 4,
    maxVideos: 1,
    mixedMedia: false,
    videoMaxSeconds: 140,
    firstComment: false,
    links: "clickable",
    notes: [
      "Standard accounts are limited to 280 weighted characters; links count as 23.",
      "Posting volume depends on the X API access tier of the connected app.",
    ],
  },
  pinterest: {
    captionMax: 500,
    counting: "codepoints",
    captionLabel: "Description",
    requiresMedia: true,
    mediaKinds: ["image", "video"],
    maxMediaItems: 1,
    maxVideos: 1,
    mixedMedia: false,
    title: { required: false, max: 100 },
    firstComment: false,
    links: "destination-field",
    notes: ["Pins link out through the destination link field, not the description."],
  },
};

/** X (twitter-text v3) weighting: code points in these ranges count 1, others 2. */
const X_LIGHT_RANGES: [number, number][] = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];
const URL_PATTERN = /\bhttps?:\/\/[^\s]+/gi;

export function countCharacters(text: string, counting: PlatformRules["counting"]): number {
  if (counting === "codepoints") return Array.from(text).length;
  let total = 0;
  const withoutUrls = text.replace(URL_PATTERN, () => {
    total += 23;
    return "";
  });
  for (const ch of withoutUrls) {
    const cp = ch.codePointAt(0)!;
    total += X_LIGHT_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi) ? 1 : 2;
  }
  return total;
}

/** The text actually sent to a platform: caption, then hashtags on their own line. */
export function composeCaption(caption: string, hashtags: readonly string[]): string {
  const tags = hashtags.filter(Boolean).map((t) => `#${t.replace(/^#/, "")}`);
  const body = caption.trimEnd();
  if (!tags.length) return body;
  return body ? `${body}\n\n${tags.join(" ")}` : tags.join(" ");
}

export function normalizeHashtags(input: string | readonly string[]): string[] {
  const raw = Array.isArray(input) ? input : String(input).split(/[\s,]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    const tag = value.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!tag || tag.length > 100) continue;
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}

export type ValidationIssue = {
  platform: Platform;
  severity: "error" | "warning";
  code: string;
  message: string;
};

export type ValidatablePost = {
  caption: string;
  hashtags: readonly string[];
  title?: string | null;
  firstComment?: string | null;
  linkUrl?: string | null;
  media: readonly { kind: "image" | "video"; durationMs?: number | null }[];
};

export function validateForPlatform(post: ValidatablePost, platform: Platform, captionOverride?: string | null): ValidationIssue[] {
  const rules = PLATFORM_RULES[platform];
  const name = PLATFORM_META[platform].name;
  const issues: ValidationIssue[] = [];
  const push = (severity: ValidationIssue["severity"], code: string, message: string) =>
    issues.push({ platform, severity, code, message });

  const text = composeCaption(captionOverride ?? post.caption, post.hashtags);
  const length = countCharacters(text, rules.counting);
  if (length > rules.captionMax) {
    push("error", "caption_too_long", `${rules.captionLabel} is ${length.toLocaleString("en")} characters; ${name} allows ${rules.captionMax.toLocaleString("en")}.`);
  }
  if (rules.hashtagsMax !== undefined && post.hashtags.length > rules.hashtagsMax) {
    push("error", "too_many_hashtags", `${name} allows at most ${rules.hashtagsMax} hashtags (you have ${post.hashtags.length}).`);
  } else if (rules.hashtagsRecommended !== undefined && post.hashtags.length > rules.hashtagsRecommended) {
    push("warning", "hashtags_hidden", `${name} shows only the first ${rules.hashtagsRecommended} hashtags prominently.`);
  }
  if (rules.mentionsMax !== undefined) {
    const mentions = (text.match(/(^|\s)@[\w.]+/g) ?? []).length;
    if (mentions > rules.mentionsMax) push("error", "too_many_mentions", `${name} allows at most ${rules.mentionsMax} mentions.`);
  }

  const images = post.media.filter((m) => m.kind === "image").length;
  const videos = post.media.filter((m) => m.kind === "video").length;
  if (rules.requiresMedia && post.media.length === 0) {
    push("error", "media_required", `${name} requires ${rules.mediaKinds.includes("image") ? "an image or video" : "a video"}.`);
  }
  for (const kind of ["image", "video"] as const) {
    if (post.media.some((m) => m.kind === kind) && !rules.mediaKinds.includes(kind)) {
      push("error", "media_kind_unsupported", `${name} doesn't accept ${kind}s for this post type.`);
    }
  }
  if (post.media.length > rules.maxMediaItems) {
    push("error", "too_many_media", `${name} allows at most ${rules.maxMediaItems} media item${rules.maxMediaItems > 1 ? "s" : ""}.`);
  }
  if (videos > rules.maxVideos) {
    push("error", "too_many_videos", `${name} allows ${rules.maxVideos === 1 ? "one video" : `${rules.maxVideos} videos`} per post.`);
  }
  if (!rules.mixedMedia && images > 0 && videos > 0) {
    push("error", "mixed_media", `${name} can't mix images and videos in one post.`);
  }
  if (rules.videoMaxSeconds !== undefined) {
    const longest = Math.max(0, ...post.media.filter((m) => m.kind === "video").map((m) => m.durationMs ?? 0));
    if (longest > rules.videoMaxSeconds * 1000) {
      push("error", "video_too_long", `${name} videos can be at most ${Math.round(rules.videoMaxSeconds / 60)} minutes here.`);
    }
    if (videos > 0 && post.media.some((m) => m.kind === "video" && !m.durationMs)) {
      push("warning", "video_duration_unknown", `Add the video duration so ${name}'s length limit can be checked.`);
    }
  }
  if (rules.title?.required && !post.title?.trim()) {
    push("error", "title_required", `${name} requires a title.`);
  }
  if (rules.title && (post.title?.length ?? 0) > rules.title.max) {
    push("error", "title_too_long", `${name} titles can be at most ${rules.title.max} characters.`);
  }
  if (post.firstComment?.trim() && !rules.firstComment) {
    push("warning", "first_comment_unsupported", `${name} doesn't support a first comment; it will be skipped.`);
  }
  if (post.linkUrl && rules.links === "not-clickable") {
    push("warning", "link_not_clickable", `Links aren't clickable on ${name}.`);
  }
  if (length === 0 && post.media.length === 0) {
    push("error", "empty", "Add a caption or media.");
  }
  return issues;
}

export function validateForPlatforms(
  post: ValidatablePost,
  targets: readonly { platform: Platform; captionOverride?: string | null }[],
): ValidationIssue[] {
  return targets.flatMap((t) => validateForPlatform(post, t.platform, t.captionOverride));
}
