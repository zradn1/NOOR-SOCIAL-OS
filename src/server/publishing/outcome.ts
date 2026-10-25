import { IntegrationNotConfiguredError, IntegrationNotImplementedError, ProviderError } from "@/server/integrations/errors";

/**
 * What the queue does after an attempt:
 * - retry:   safe to try again (the provider rejected the request before
 *            processing it, e.g. rate limits); backs off exponentially
 * - fail:    permanent problem (bad request, policy) or attempts exhausted
 * - block:   can't run until a person acts (not connected, not implemented)
 * - unknown: the request may have reached the provider; never auto-retried
 */
export type AttemptDecision =
  | { kind: "retry"; code: string; message: string; delayMs: number }
  | { kind: "fail"; code: string; message: string }
  | { kind: "block"; code: string; message: string }
  | { kind: "unknown"; code: string; message: string };

export class BlockedError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "BlockedError";
  }
}

export class PermanentError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60 * 60_000;

/** Exponential backoff with full jitter: random in [delay/2, delay]. */
export function backoffDelay(attempt: number, random: () => number = Math.random, retryAfterSeconds?: number) {
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));
  const jittered = exponential / 2 + random() * (exponential / 2);
  return Math.max(jittered, (retryAfterSeconds ?? 0) * 1000);
}

export function decide(
  error: unknown,
  ctx: { attempts: number; maxAttempts: number; idempotentProvider: boolean; random?: () => number },
): AttemptDecision {
  if (error instanceof BlockedError) return { kind: "block", code: error.code, message: error.message };
  if (error instanceof IntegrationNotImplementedError || error instanceof IntegrationNotConfiguredError) {
    return { kind: "block", code: error.code, message: error.message };
  }
  if (error instanceof PermanentError) return { kind: "fail", code: error.code, message: error.message };
  if (error instanceof ProviderError) {
    if (!error.retryable) return { kind: "fail", code: error.code, message: error.message };
    if (ctx.attempts >= ctx.maxAttempts) {
      return { kind: "fail", code: "attempts_exhausted", message: `Gave up after ${ctx.attempts} attempts: ${error.message}` };
    }
    return {
      kind: "retry",
      code: error.code,
      message: error.message,
      delayMs: backoffDelay(ctx.attempts, ctx.random, error.retryAfterSeconds),
    };
  }
  // Timeouts and network errors: the request may have been processed.
  if (ctx.idempotentProvider && ctx.attempts < ctx.maxAttempts) {
    return { kind: "retry", code: "transient", message: "Temporary error; retrying safely.", delayMs: backoffDelay(ctx.attempts, ctx.random) };
  }
  return {
    kind: "unknown",
    code: "outcome_unknown",
    message: "The platform didn't confirm the result. Check the platform before retrying, the post may already be live.",
  };
}
