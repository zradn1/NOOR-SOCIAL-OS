import type { Metric } from "@/lib/platforms/metrics";
import type { Platform } from "@/lib/platforms/registry";

export type TokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  scopes: string[];
  /** Absolute expiry instants (not "expires_in"). */
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
};

export type ProviderAccount = {
  externalAccountId: string;
  displayName: string;
  handle?: string | null;
};

export type PublishRequest = {
  accessToken: string;
  externalAccountId: string;
  /** Stable per publish intent; forwarded to providers that support idempotency. */
  idempotencyKey: string;
  text: string;
  title?: string | null;
  firstComment?: string | null;
  linkUrl?: string | null;
  media: { kind: "image" | "video"; url: string; mimeType: string; altText?: string | null }[];
  settings: Record<string, unknown>;
};

/**
 * A provider may only report `published` together with the platform's own id
 * for the new post. That id is what lets the database mark a target published.
 */
export type PublishResult = {
  outcome: "published";
  externalPostId: string;
  externalUrl?: string | null;
  publishedAt: Date;
  /** Sanitized response metadata for support (no tokens). */
  details?: Record<string, unknown>;
};

export type MetricSnapshotInput = {
  metricDate: string; // YYYY-MM-DD
  values: Partial<Record<Metric, number | null>>;
  raw?: Record<string, unknown>;
};

export type ProviderCapabilities = {
  publish: { text: boolean; image: boolean; video: boolean; carousel: boolean };
  analytics: boolean;
  tokenRefresh: boolean;
  revoke: boolean;
  /** True when the provider deduplicates by our idempotency key server-side. */
  idempotentPublish: boolean;
};

export type ProviderStatus = {
  platform: Platform;
  /** An official integration exists in this codebase. */
  implemented: boolean;
  /** Required credentials are present in the environment. */
  configured: boolean;
  missingConfig: string[];
  summary: string;
};

export interface SocialProvider {
  readonly platform: Platform;
  readonly capabilities: ProviderCapabilities;
  readonly scopes: readonly string[];
  readonly docs: { developerPortal: string; authorizeEndpoint: string; tokenEndpoint: string; notes: string };
  status(): ProviderStatus;
  buildAuthorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<TokenSet>;
  refreshToken(input: { refreshToken: string }): Promise<TokenSet>;
  revokeToken(input: { accessToken: string | null; refreshToken: string | null }): Promise<void>;
  fetchAccount(input: { accessToken: string }): Promise<ProviderAccount>;
  publish(input: PublishRequest): Promise<PublishResult>;
  fetchMetrics(input: { accessToken: string; externalAccountId: string; since: string; until: string }): Promise<MetricSnapshotInput[]>;
}
