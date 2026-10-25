import "server-only";
import { PLATFORM_META, type Platform } from "@/lib/platforms/registry";
import { IntegrationNotImplementedError } from "../errors";
import type { ProviderCapabilities, SocialProvider } from "../types";

export type PlaceholderDefinition = {
  platform: Platform;
  envKeys: string[];
  scopes: string[];
  capabilities: ProviderCapabilities;
  docs: SocialProvider["docs"];
};

/**
 * A provider whose official API integration has not been written yet. It
 * documents what an implementation needs and refuses every operation: no
 * request is ever sent, and nothing can be reported as connected or published.
 */
export function createPlaceholderProvider(def: PlaceholderDefinition): SocialProvider {
  const name = PLATFORM_META[def.platform].name;
  const refuse = (operation: string) => {
    throw new IntegrationNotImplementedError(def.platform, operation);
  };
  return {
    platform: def.platform,
    capabilities: def.capabilities,
    scopes: def.scopes,
    docs: def.docs,
    status() {
      const missing = def.envKeys.filter((key) => !process.env[key]);
      return {
        platform: def.platform,
        implemented: false,
        configured: missing.length === 0,
        missingConfig: missing,
        summary:
          missing.length > 0
            ? `The official ${name} integration isn't built yet, and its app credentials aren't configured.`
            : `App credentials for ${name} are present, but the official integration isn't built yet.`,
      };
    },
    buildAuthorizationUrl: () => refuse("authorization"),
    exchangeCode: async () => refuse("code exchange"),
    refreshToken: async () => refuse("token refresh"),
    revokeToken: async () => refuse("token revocation"),
    fetchAccount: async () => refuse("account lookup"),
    publish: async () => refuse("publishing"),
    fetchMetrics: async () => refuse("analytics sync"),
  };
}
