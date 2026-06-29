import { createDirectCredentialProvider } from "./direct-provider";
import type { CredentialProvider } from "./types";

export type CredentialProviderConfig = {
  directSecrets?: Record<string, string>;
};

/**
 * Builds a CredentialProvider for app-level secrets (e.g. the Slack bot token).
 *
 * Third-party OAuth integrations (GitHub, Gmail, Linear, …) are handled by
 * Composio's hosted connected-accounts layer, not here. This provider only
 * serves direct, app-owned secrets passed in via config.
 */
export function createCredentialProvider(config: CredentialProviderConfig): CredentialProvider {
  return createDirectCredentialProvider(config.directSecrets ?? {});
}

export { createDirectCredentialProvider } from "./direct-provider";
export type { ConnectionId, CredentialProvider, ScopedToken } from "./types";
