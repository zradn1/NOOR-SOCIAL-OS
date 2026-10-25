import { describe, expect, it } from "vitest";
import { aiRequestSchema, sanitizeOutput } from "@/lib/ai/tasks";
import { demoProvider } from "@/server/ai/demo";
import { systemPrompt, userPrompt } from "@/server/ai/prompt";

const request = (over: Record<string, unknown> = {}) => aiRequestSchema.parse({ task: "caption", brief: "Hand-poured amber candles for autumn", ...over });

describe("AI request validation", () => {
  it("applies defaults and rejects bad input", () => {
    const r = request();
    expect(r).toMatchObject({ tone: "warm", platforms: [], language: "English" });
    expect(aiRequestSchema.safeParse({ task: "caption", brief: "x" }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ task: "essay", brief: "valid brief" }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ task: "ideas", brief: "valid brief", platforms: ["myspace"] }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ task: "ideas", brief: "valid brief", count: 99 }).success).toBe(false);
  });
});

describe("prompts", () => {
  it("wraps the brief as data and includes platform limits", () => {
    const text = userPrompt(request({ platforms: ["x", "instagram"], audience: "" }));
    expect(text).toContain("<brief>\nHand-poured amber candles for autumn\n</brief>");
    expect(text).toMatch(/X: post up to 280 characters/i);
    expect(text).toMatch(/Instagram: caption up to 2200 characters; at most 30 hashtags; links in captions are not clickable/);
    expect(text).not.toContain("Audience:");
  });

  it("uses a dedicated tag for captions being adapted", () => {
    const text = userPrompt(request({ task: "adapt", brief: "Original caption here", platforms: ["linkedin"] }));
    expect(text).toContain("<original_caption>");
    expect(text).toContain("once for each target platform");
  });

  it("forbids invented facts in the system prompt", () => {
    const text = systemPrompt({ workspaceName: "Maison Lumière", description: "Candle studio in Lyon" });
    expect(text).toContain("Maison Lumière");
    expect(text).toContain("Candle studio in Lyon");
    expect(text).toMatch(/Do not invent facts/);
  });
});

describe("sanitizeOutput", () => {
  it("trims, caps counts, cleans hashtags, and drops unrequested platforms", () => {
    const out = sanitizeOutput(
      {
        items: [
          { title: "  One ", body: " First ", platform: "x", hashtags: ["#Candles", "candles", "bad tag", "##home_decor", ""] },
          { title: "", body: "Second", platform: "tiktok", hashtags: [] },
          { title: null, body: "Third", platform: null, hashtags: [] },
          { title: null, body: "   ", platform: null, hashtags: [] },
        ],
        notes: "  ",
      },
      { task: "caption", platforms: ["x"], count: 2 },
    );
    expect(out.items).toEqual([
      { title: "One", body: "First", platform: "x", hashtags: ["Candles", "candles", "home_decor"] },
      { title: null, body: "Second", platform: null, hashtags: [] },
    ]);
    expect(out.notes).toBeNull();
  });
});

describe("demo provider", () => {
  it("is deterministic, labelled, and never claims a model", async () => {
    const r = request({ task: "ideas", platforms: ["instagram", "tiktok"], count: 4 });
    const a = await demoProvider.generate(r, { workspaceName: "W", description: null });
    const b = await demoProvider.generate(r, { workspaceName: "W", description: null });
    expect(a).toEqual(b);
    expect(a).toMatchObject({ provider: "demo", model: null, isDemoOutput: true, usage: null });
    expect(a.output.items).toHaveLength(4);
    expect(a.output.notes).toMatch(/No AI model was used/);
  });

  it("adapts within each platform's limit", async () => {
    const long = "This is a sentence about candles. ".repeat(20);
    const r = request({ task: "adapt", brief: long, platforms: ["x", "linkedin"] });
    const { output } = await demoProvider.generate(r, { workspaceName: "W", description: null });
    const x = output.items.find((i) => i.platform === "x")!;
    expect(x.body.length).toBeLessThanOrEqual(280);
    expect(output.items.map((i) => i.platform)).toEqual(["x", "linkedin"]);
  });

  it("builds hashtags only from the brief's own words", async () => {
    const r = request({ task: "hashtags", brief: "Minimal Scandinavian living room makeover", count: 5 });
    const { output } = await demoProvider.generate(r, { workspaceName: "W", description: null });
    for (const tag of output.items[0]!.hashtags) expect("minimalscandinavianlivingroommakeover").toContain(tag.toLowerCase().slice(0, 4));
  });
});
