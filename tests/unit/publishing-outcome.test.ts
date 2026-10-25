import { describe, expect, it } from "vitest";
import { IntegrationNotImplementedError, ProviderError } from "@/server/integrations/errors";
import { backoffDelay, BlockedError, decide, PermanentError } from "@/server/publishing/outcome";

const ctx = (attempts: number, idempotentProvider = false) => ({ attempts, maxAttempts: 5, idempotentProvider, random: () => 1 });

describe("backoff", () => {
  it("grows exponentially, caps at an hour, and honours Retry-After", () => {
    expect(backoffDelay(1, () => 1)).toBe(30_000);
    expect(backoffDelay(3, () => 1)).toBe(120_000);
    expect(backoffDelay(20, () => 1)).toBe(3_600_000);
    expect(backoffDelay(1, () => 0)).toBe(15_000); // jitter floor is half
    expect(backoffDelay(1, () => 0, 600)).toBe(600_000);
  });
});

describe("attempt decisions", () => {
  it("retries provider errors marked retryable until attempts run out", () => {
    const rateLimited = new ProviderError("x", "rate_limited", "Too many requests", true, 429, 60);
    expect(decide(rateLimited, ctx(1))).toMatchObject({ kind: "retry", code: "rate_limited", delayMs: 60_000 });
    expect(decide(rateLimited, ctx(5))).toMatchObject({ kind: "fail", code: "attempts_exhausted" });
  });

  it("fails permanently on non-retryable provider errors and validation", () => {
    expect(decide(new ProviderError("x", "invalid_media", "Bad media", false, 400), ctx(1))).toMatchObject({ kind: "fail" });
    expect(decide(new PermanentError("validation_failed", "Too long"), ctx(1))).toMatchObject({ kind: "fail" });
  });

  it("blocks on missing integrations or connections instead of retrying", () => {
    expect(decide(new IntegrationNotImplementedError("tiktok", "publishing"), ctx(1))).toMatchObject({ kind: "block", code: "not_implemented" });
    expect(decide(new BlockedError("account_not_connected", "x"), ctx(1))).toMatchObject({ kind: "block" });
  });

  it("never auto-retries an unknown outcome for non-idempotent providers", () => {
    expect(decide(new Error("socket hang up"), ctx(1))).toMatchObject({ kind: "unknown", code: "outcome_unknown" });
    expect(decide(new Error("socket hang up"), ctx(1, true))).toMatchObject({ kind: "retry", code: "transient" });
  });
});
