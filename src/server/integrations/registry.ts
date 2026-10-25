import "server-only";
import { PLATFORMS, type Platform } from "@/lib/platforms/registry";
import { PROVIDERS } from "./providers";
import type { ProviderStatus, SocialProvider } from "./types";

export type ProviderRegistry = { get(platform: Platform): SocialProvider };

export const defaultRegistry: ProviderRegistry = { get: (platform) => PROVIDERS[platform] };

export function listProviderStatuses(registry: ProviderRegistry = defaultRegistry): ProviderStatus[] {
  return PLATFORMS.map((p) => registry.get(p).status());
}

/** True only for a built, configured official integration. */
export function canConnect(status: ProviderStatus) {
  return status.implemented && status.configured;
}
