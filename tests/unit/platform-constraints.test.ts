import { describe, expect, it } from "vitest";
import {
  composeCaption,
  countCharacters,
  normalizeHashtags,
  validateForPlatform,
  validateForPlatforms,
  type ValidatablePost,
} from "@/lib/platforms/constraints";
import { isMetricAvailable, metricLabel } from "@/lib/platforms/metrics";

const base: ValidatablePost = { caption: "Autumn collection, now live.", hashtags: [], media: [] };
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("caption composition", () => {
  it("appends hashtags on their own line", () => {
    expect(composeCaption("Hello", ["noor", "#studio"])).toBe("Hello\n\n#noor #studio");
    expect(composeCaption("", ["noor"])).toBe("#noor");
  });

  it("normalizes, de-duplicates, and strips punctuation from hashtags", () => {
    expect(normalizeHashtags("#Noor, noor  #studio!! #عطر")).toEqual(["Noor", "studio", "عطر"]);
  });
});

describe("character counting", () => {
  it("counts code points, so emoji count once outside X", () => {
    expect(countCharacters("hi 👋", "codepoints")).toBe(4);
  });

  it("applies X weighting: URLs are 23, CJK and emoji are 2", () => {
    expect(countCharacters("https://example.com/a/very/long/path?x=1", "x-weighted")).toBe(23);
    expect(countCharacters("日本", "x-weighted")).toBe(4);
    expect(countCharacters("ab👋", "x-weighted")).toBe(4);
  });
});

describe("platform validation", () => {
  it("enforces X's 280 weighted characters", () => {
    expect(codes(validateForPlatform({ ...base, caption: "a".repeat(281) }, "x"))).toContain("caption_too_long");
    expect(validateForPlatform({ ...base, caption: "a".repeat(280) }, "x")).toEqual([]);
  });

  it("requires media on Instagram, TikTok, YouTube, and Pinterest", () => {
    for (const p of ["instagram", "tiktok", "youtube", "pinterest"] as const) {
      expect(codes(validateForPlatform(base, p)), p).toContain("media_required");
    }
    expect(codes(validateForPlatform(base, "linkedin"))).not.toContain("media_required");
  });

  it("requires a video and a title for YouTube", () => {
    const issues = codes(validateForPlatform({ ...base, media: [{ kind: "image" }] }, "youtube"));
    expect(issues).toEqual(expect.arrayContaining(["media_kind_unsupported", "title_required"]));
    expect(validateForPlatform({ ...base, title: "Launch", media: [{ kind: "video", durationMs: 60_000 }] }, "youtube")).toEqual([]);
  });

  it("caps Instagram hashtags at 30 and carousel items at 10", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `tag${i}`);
    expect(codes(validateForPlatform({ ...base, hashtags: tags, media: [{ kind: "image" }] }, "instagram"))).toContain("too_many_hashtags");
    const media = Array.from({ length: 11 }, () => ({ kind: "image" as const }));
    expect(codes(validateForPlatform({ ...base, media }, "instagram"))).toContain("too_many_media");
  });

  it("forbids mixing images and videos where the platform does", () => {
    const media = [{ kind: "image" as const }, { kind: "video" as const, durationMs: 1000 }];
    expect(codes(validateForPlatform({ ...base, media }, "x"))).toContain("mixed_media");
    expect(codes(validateForPlatform({ ...base, media }, "instagram"))).not.toContain("mixed_media");
  });

  it("flags over-long videos and warns when duration is unknown", () => {
    expect(codes(validateForPlatform({ ...base, media: [{ kind: "video", durationMs: 200_000 }] }, "x"))).toContain("video_too_long");
    expect(codes(validateForPlatform({ ...base, media: [{ kind: "video" }] }, "x"))).toContain("video_duration_unknown");
  });

  it("uses a per-target caption override when given", () => {
    const issues = validateForPlatforms({ ...base, caption: "a".repeat(500) }, [
      { platform: "x", captionOverride: "Short version for X" },
      { platform: "linkedin" },
    ]);
    expect(issues).toEqual([]);
  });

  it("warns that first comments are skipped where unsupported", () => {
    expect(codes(validateForPlatform({ ...base, firstComment: "More below" }, "x"))).toContain("first_comment_unsupported");
  });
});

describe("metric availability", () => {
  it("knows platform-specific gaps and names", () => {
    expect(isMetricAvailable("youtube", "impressions")).toBe(false);
    expect(isMetricAvailable("tiktok", "reach")).toBe(false);
    expect(metricLabel("youtube", "followers")).toBe("Subscribers");
    expect(metricLabel("x", "shares")).toBe("Reposts");
  });
});
