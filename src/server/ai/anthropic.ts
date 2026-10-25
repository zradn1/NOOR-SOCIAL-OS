import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { aiOutputSchema } from "@/lib/ai/tasks";
import { AppError } from "@/server/errors";
import { logger } from "@/server/observability/logger";
import type { AiProvider } from "./provider";
import { systemPrompt, userPrompt } from "./prompt";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

let cached: { apiKey: string; client: Anthropic } | null = null;

function clientFor(apiKey: string) {
  if (cached?.apiKey !== apiKey) {
    cached = { apiKey, client: new Anthropic({ apiKey, timeout: 90_000, maxRetries: 2 }) };
  }
  return cached.client;
}

/**
 * Claude via the official SDK, server-side only. Output is constrained to the
 * shared schema with structured outputs; policy declines are retried
 * server-side on Anthropic's recommended fallback model.
 */
export function anthropicProvider(config: { apiKey: string; model: string; effort: Effort }): AiProvider {
  return {
    id: "anthropic",
    async generate(request, brand) {
      const client = clientFor(config.apiKey);
      let response;
      try {
        response = await client.beta.messages.parse({
          model: config.model,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: config.effort, format: betaZodOutputFormat(aiOutputSchema) },
          system: systemPrompt(brand),
          messages: [{ role: "user", content: userPrompt(request) }],
        });
      } catch (error) {
        throw toAppError(error);
      }

      if (response.stop_reason === "refusal") {
        throw new AppError("VALIDATION", "The AI model declined this request. Try rephrasing the brief.");
      }
      if (response.stop_reason === "max_tokens" || !response.parsed_output) {
        logger.warn("ai.unparseable_response", { stopReason: response.stop_reason, requestId: response._request_id });
        throw new AppError("INTEGRATION_UNAVAILABLE", "The AI response was incomplete. Try again, or ask for fewer items.");
      }
      return {
        output: response.parsed_output,
        provider: "anthropic",
        model: response.model,
        isDemoOutput: false,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
      };
    },
  };
}

function toAppError(error: unknown): AppError {
  if (error instanceof Anthropic.RateLimitError) {
    return new AppError("RATE_LIMITED", "The AI service is at capacity right now. Try again in a minute.");
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    logger.error("ai.credentials_rejected", { status: error.status, requestId: error.requestID });
    return new AppError("NOT_CONFIGURED", "The AI assistant isn't configured correctly. Ask an administrator to check the API key.");
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    logger.error("ai.request_rejected", { status: error.status, requestId: error.requestID, message: error.message });
    return new AppError("INTEGRATION_UNAVAILABLE", "The AI service rejected the request. An administrator can find details in the server logs.");
  }
  if (error instanceof Anthropic.APIError) {
    logger.warn("ai.service_error", { status: error.status, requestId: error.requestID });
    return new AppError("INTEGRATION_UNAVAILABLE", "The AI service is temporarily unavailable. Try again shortly.");
  }
  logger.error("ai.unexpected_error", { error });
  return new AppError("INTEGRATION_UNAVAILABLE", "The AI service is temporarily unavailable. Try again shortly.");
}
