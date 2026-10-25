import "server-only";
import type { AiOutput, AiRequest } from "@/lib/ai/tasks";
import { env } from "@/server/env";
import { anthropicProvider } from "./anthropic";
import { demoProvider } from "./demo";
import type { BrandContext } from "./prompt";

export type AiProviderId = "anthropic" | "demo";

export type AiResult = {
  output: AiOutput;
  provider: AiProviderId;
  /** The model that produced the output (may be a server-side fallback model); null for demo output. */
  model: string | null;
  /** True when no AI model was involved. */
  isDemoOutput: boolean;
  usage: { inputTokens: number; outputTokens: number } | null;
};

export interface AiProvider {
  id: AiProviderId;
  generate(request: AiRequest, brand: BrandContext): Promise<AiResult>;
}

export type AiStatus =
  | { mode: "anthropic"; model: string }
  | { mode: "demo"; reason: "forced" | "no_key" }
  | { mode: "misconfigured"; reason: string };

/**
 * AI_PROVIDER=auto uses Anthropic when a key is configured and the demo
 * provider otherwise; "anthropic" requires a key; "demo" never calls a model.
 */
export function aiStatus(): AiStatus {
  const e = env();
  if (e.AI_PROVIDER === "demo") return { mode: "demo", reason: "forced" };
  if (e.ANTHROPIC_API_KEY) return { mode: "anthropic", model: e.ANTHROPIC_MODEL };
  if (e.AI_PROVIDER === "anthropic") return { mode: "misconfigured", reason: "AI_PROVIDER is anthropic but ANTHROPIC_API_KEY is not set." };
  return { mode: "demo", reason: "no_key" };
}

export function selectProvider(): AiProvider | null {
  const status = aiStatus();
  if (status.mode === "misconfigured") return null;
  if (status.mode === "demo") return demoProvider;
  const e = env();
  return anthropicProvider({ apiKey: e.ANTHROPIC_API_KEY!, model: e.ANTHROPIC_MODEL, effort: e.ANTHROPIC_EFFORT });
}
