import type { Platform } from "@/lib/platforms/registry";

/** The official integration for this platform has not been built yet. */
export class IntegrationNotImplementedError extends Error {
  readonly code = "not_implemented";
  readonly retryable = false;
  constructor(public readonly platform: Platform, operation: string) {
    super(`${platform}: ${operation} is not implemented. No request was sent to the platform.`);
    this.name = "IntegrationNotImplementedError";
  }
}

/** Credentials for the platform's app are missing from the environment. */
export class IntegrationNotConfiguredError extends Error {
  readonly code = "not_configured";
  readonly retryable = false;
  constructor(public readonly platform: Platform, public readonly missing: string[]) {
    super(`${platform}: missing configuration ${missing.join(", ")}`);
    this.name = "IntegrationNotConfiguredError";
  }
}

/**
 * An error returned by a platform. `retryable` decides whether the queue backs
 * off and tries again (rate limits, 5xx) or fails immediately (4xx, policy).
 */
export class ProviderError extends Error {
  constructor(
    public readonly platform: Platform,
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly httpStatus?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
