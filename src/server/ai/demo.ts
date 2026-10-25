import "server-only";
import { AI_TASK_META, type AiItem, type AiRequest } from "@/lib/ai/tasks";
import { PLATFORM_RULES } from "@/lib/platforms/constraints";
import type { Platform } from "@/lib/platforms/registry";
import { seededRandom } from "@/server/integrations/demo";
import type { AiProvider } from "./provider";

/**
 * Template-based stand-in used when no AI model is configured. It never calls
 * a model and only reshapes the user's own words, so output is labelled as
 * demo output everywhere it appears.
 */
export const demoProvider: AiProvider = {
  id: "demo",
  async generate(request) {
    const random = seededRandom(`${request.task}:${request.brief}:${request.platforms.join(",")}`);
    const count = request.count ?? AI_TASK_META[request.task].defaultCount;
    const topic = summarize(request.brief);
    const tags = keywordTags(request.brief);
    const platformCycle = (i: number): Platform | null => (request.platforms.length ? request.platforms[i % request.platforms.length]! : null);

    let items: AiItem[];
    switch (request.task) {
      case "ideas":
        items = shuffle(IDEA_FORMATS, random)
          .slice(0, count)
          .map((f, i) => ({ title: f.title, body: f.body(topic), platform: platformCycle(i), hashtags: [] }));
        break;
      case "caption":
        items = Array.from({ length: count }, (_, i) => ({
          title: null,
          body: `${rotate(OPENERS[request.tone], i)} ${capitalize(topic)}.\n\n${rotate(MIDDLES, i)}\n\n${rotate(CLOSERS, i + 1)}`,
          platform: platformCycle(i),
          hashtags: tags.slice(0, 5),
        }));
        break;
      case "hooks":
        items = shuffle(HOOKS, random)
          .slice(0, count)
          .map((h) => ({ title: h.style, body: h.text(topic), platform: null, hashtags: [] }));
        break;
      case "hashtags":
        items = [{ title: null, body: "Built from the words in your brief. Check each tag on the platform before using it.", platform: null, hashtags: tags.slice(0, count) }];
        break;
      case "campaign":
        items = Array.from({ length: count }, (_, i) => {
          const phase = PHASES[Math.min(PHASES.length - 1, Math.floor((i / count) * PHASES.length))]!;
          return { title: phase.name, body: phase.body(topic), platform: platformCycle(i), hashtags: [] };
        });
        break;
      case "adapt":
        items = (request.platforms.length ? request.platforms : (["instagram"] as Platform[])).map((p) => ({
          title: null,
          body: adaptFor(p, request.brief),
          platform: p,
          hashtags: [],
        }));
        break;
    }
    return {
      output: { items, notes: "Demo output: assembled from templates and your brief. No AI model was used." },
      provider: "demo",
      model: null,
      isDemoOutput: true,
      usage: null,
    };
  },
};

function summarize(brief: string) {
  const first = brief.split(/(?<=[.!?])\s|\n/)[0]!.trim().replace(/[.!?]+$/, "");
  return first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first;
}

const STOP = new Set(["about", "after", "their", "there", "these", "those", "which", "while", "with", "from", "into", "that", "this", "your", "ours", "want", "more", "for", "and", "the", "our", "new", "we", "a", "an", "of", "to", "in", "on"]);

function keywordTags(brief: string) {
  const words = brief.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  const unique = [...new Set(words.filter((w) => !STOP.has(w)))];
  const pairs = unique.slice(0, 6).flatMap((w, i) => (unique[i + 1] ? [`${w}${unique[i + 1]}`] : []));
  return [...unique, ...pairs].slice(0, 30);
}

function adaptFor(platform: Platform, caption: string) {
  const max = platform === "x" ? 270 : PLATFORM_RULES[platform].captionMax;
  let text = caption.trim();
  if (platform === "linkedin") text = text.replace(/([.!?])\s+/g, "$1\n\n");
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (sentenceEnd > max * 0.5 ? cut.slice(0, sentenceEnd + 1) : `${cut.slice(0, max - 1).trimEnd()}…`).trim();
}

function shuffle<T>(list: readonly T[], random: () => number) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const rotate = <T,>(list: readonly T[], i: number) => list[i % list.length]!;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const IDEA_FORMATS = [
  { title: "Behind the scenes", body: (t: string) => `Short video showing how ${t} comes together. Keep it unpolished; end on the finished result.` },
  { title: "Step-by-step carousel", body: (t: string) => `A 5-slide carousel breaking ${t} into simple steps, with one tip per slide.` },
  { title: "Myth vs. reality", body: (t: string) => `Pick a common misconception related to ${t} and correct it in a two-part post.` },
  { title: "Before and after", body: (t: string) => `Side-by-side visual that shows the change ${t} makes. Let the image do the talking.` },
  { title: "Question box", body: (t: string) => `Invite questions about ${t}, then answer the best three in follow-up posts.` },
  { title: "Quick tip", body: (t: string) => `One practical tip about ${t} that someone can use today.` },
  { title: "Team spotlight", body: (t: string) => `Introduce the person behind ${t} and what they care about.` },
  { title: "Poll", body: (t: string) => `Ask your audience to choose between two options related to ${t}.` },
];

const OPENERS: Record<AiRequest["tone"], readonly string[]> = {
  warm: ["Something we've been looking forward to:", "A small moment we wanted to share:"],
  playful: ["Okay, hear us out:", "Plot twist:"],
  premium: ["Introducing", "Considered, crafted, and finally here:"],
  bold: ["Let's be clear:", "This changes the conversation:"],
  informative: ["Here's what to know:", "Quick guide:"],
  calm: ["Slow down for a moment.", "A quieter update:"],
};
const MIDDLES = ["Tell us what you'd like to see next in the comments.", "Save this for later and share it with someone who'd love it.", "More details are in our bio: [link]."];
const CLOSERS = ["See you soon.", "Thanks for being here.", "More to come."];

const HOOKS = [
  { style: "Contrarian", text: (t: string) => `Everyone gets ${t} slightly wrong. Here's why.` },
  { style: "Curiosity", text: (t: string) => `I didn't expect this when we started ${t}.` },
  { style: "List", text: (t: string) => `3 things nobody tells you about ${t}.` },
  { style: "Direct", text: (t: string) => `If you care about ${t}, watch this before you start.` },
  { style: "Question", text: (t: string) => `What would change if ${t} took half the time?` },
  { style: "Story", text: (t: string) => `This is how ${t} actually looks behind the scenes.` },
  { style: "Challenge", text: (t: string) => `Try this the next time you think about ${t}.` },
];

const PHASES = [
  { name: "Teaser", body: (t: string) => `Hint at ${t} without revealing it. Close-up visuals, one line of copy.` },
  { name: "Launch", body: (t: string) => `Announce ${t} clearly: what it is, who it's for, and where to find it [link].` },
  { name: "Proof", body: (t: string) => `Show ${t} in use. Share real feedback only if you have permission to.` },
  { name: "Reminder", body: (t: string) => `Remind your audience about ${t} and answer a common question.` },
];
