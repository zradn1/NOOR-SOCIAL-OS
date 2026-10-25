import "server-only";
import { aiOutputSchema, aiRequestSchema, sanitizeOutput, type AiOutput, type AiRequest, type AiTask } from "@/lib/ai/tasks";
import type { Platform } from "@/lib/platforms/registry";
import { selectProvider, type AiProvider, type AiProviderId } from "@/server/ai/provider";
import { assertCan, type WorkspaceContext } from "@/server/auth/context";
import { getDb, withSystem, withUser } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { logger } from "@/server/observability/logger";
import { assertWithinLimit } from "./plan-limits";

export type Generation = {
  id: string;
  task: AiTask;
  provider: AiProviderId;
  model: string | null;
  isDemoOutput: boolean;
  input: AiRequest;
  output: AiOutput;
  createdAt: string;
  author: string | null;
};

/**
 * Runs one assistant request. Role and plan quota are checked before the
 * provider is called; only model generations count toward the quota (demo
 * output is free). Generations are stored for the workspace's history.
 */
export async function generateWithAssistant(
  ctx: WorkspaceContext,
  request: AiRequest,
  deps: { provider?: AiProvider | null; db?: ReturnType<typeof getDb> } = {},
): Promise<Generation> {
  assertCan(ctx, "ai.use");
  const db = deps.db ?? getDb();
  const provider = deps.provider === undefined ? selectProvider() : deps.provider;
  if (!provider) {
    throw new AppError("NOT_CONFIGURED", "The AI assistant isn't configured. An administrator needs to set ANTHROPIC_API_KEY or enable demo mode.");
  }
  if (request.task === "adapt" && request.platforms.length === 0) {
    throw new AppError("VALIDATION", "Choose at least one platform to adapt the caption for.");
  }

  // Quota check before spending on the model. The usage row is written after
  // the call, so concurrent requests can overshoot by a few (bounded by the
  // per-user rate limit); the next request is then refused.
  if (provider.id !== "demo") {
    await withSystem((trx) => assertWithinLimit(trx, ctx.organization.id, "ai_generations_per_month"), db);
  }

  const started = Date.now();
  const result = await provider.generate(request, { workspaceName: ctx.workspace.name, description: ctx.workspace.description });
  const output = sanitizeOutput(result.output, request);
  if (!output.items.length) throw new AppError("INTEGRATION_UNAVAILABLE", "The assistant returned nothing usable. Try a more specific brief.");
  logger.info("ai.generated", {
    workspaceId: ctx.workspace.id,
    task: request.task,
    provider: result.provider,
    model: result.model,
    ms: Date.now() - started,
    inputTokens: result.usage?.inputTokens,
    outputTokens: result.usage?.outputTokens,
  });

  const row = await withSystem(async (trx) => {
    const inserted = await trx
      .insertInto("ai_generations")
      .values({
        workspace_id: ctx.workspace.id,
        user_id: ctx.user.id,
        task: request.task,
        provider: result.provider,
        model: result.model,
        is_demo_output: result.isDemoOutput,
        input: JSON.stringify(request),
        output: JSON.stringify(output),
      })
      .returning(["id", "created_at"])
      .executeTakeFirstOrThrow();
    if (!result.isDemoOutput) {
      await trx
        .insertInto("usage_records")
        .values({
          organization_id: ctx.organization.id,
          workspace_id: ctx.workspace.id,
          user_id: ctx.user.id,
          metric: "ai_generation",
          quantity: 1,
          metadata: JSON.stringify({ generation_id: inserted.id, model: result.model, task: request.task }),
        })
        .execute();
    }
    return inserted;
  }, db);

  return {
    id: row.id,
    task: request.task,
    provider: result.provider,
    model: result.model,
    isDemoOutput: result.isDemoOutput,
    input: request,
    output,
    createdAt: new Date(row.created_at).toISOString(),
    author: null,
  };
}

function toGeneration(r: {
  id: string;
  task: string;
  provider: string;
  model: string | null;
  is_demo_output: boolean;
  input: unknown;
  output: unknown;
  created_at: string | Date;
  author: string | null;
}): Generation | null {
  const input = aiRequestSchema.safeParse(r.input);
  const output = aiOutputSchema.safeParse(r.output);
  if (!input.success || !output.success) return null;
  return {
    id: r.id,
    task: input.data.task,
    provider: r.provider === "anthropic" ? "anthropic" : "demo",
    model: r.model,
    isDemoOutput: r.is_demo_output,
    input: input.data,
    output: output.data,
    createdAt: new Date(r.created_at).toISOString(),
    author: r.author,
  };
}

export async function listGenerations(ctx: WorkspaceContext, limit = 20, db = getDb()): Promise<Generation[]> {
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("ai_generations as g")
        .leftJoin("profiles as p", "p.id", "g.user_id")
        .select(["g.id", "g.task", "g.provider", "g.model", "g.is_demo_output", "g.input", "g.output", "g.created_at", "p.full_name as author"])
        .where("g.workspace_id", "=", ctx.workspace.id)
        .orderBy("g.created_at", "desc")
        .limit(limit)
        .execute(),
    db,
  );
  return rows.map(toGeneration).filter((g): g is Generation => g !== null);
}

/** One item of a stored generation, for starting a post from it. */
export async function getGenerationItem(ctx: WorkspaceContext, id: string, index: number, db = getDb()) {
  const row = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("ai_generations")
        .select(["id", "task", "provider", "model", "is_demo_output", "input", "output", "created_at"])
        .where("id", "=", id)
        .where("workspace_id", "=", ctx.workspace.id)
        .executeTakeFirst(),
    db,
  );
  const generation = row ? toGeneration({ ...row, author: null }) : null;
  const item = generation?.output.items[index];
  if (!generation || !item) return null;
  return { ...item, platform: item.platform as Platform | null, task: generation.task, isDemoOutput: generation.isDemoOutput };
}
