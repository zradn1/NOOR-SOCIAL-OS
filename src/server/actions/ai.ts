"use server";

import { z } from "zod";
import { aiRequestSchema } from "@/lib/ai/tasks";
import { loadWorkspaceForAction } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { generateWithAssistant } from "@/server/services/ai";
import { parseInput, runAction } from "./run";

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);

export async function generateAction(slug: string, input: Record<string, unknown>) {
  return runAction("ai.generate", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "ai.use");
    const request = parseInput(aiRequestSchema, input);
    await enforceRateLimit("aiGenerate", ctx.user.id);
    return generateWithAssistant(ctx, request);
  });
}
