import { createConnectCredentialProvider } from "./connect-provider";
import { createDirectCredentialProvider } from "./direct-provider";
import type { CredentialProvider } from "./types";

export type CredentialProviderConfig = {
  connectorMap?: Record<string, string>;
  directSecrets?: Record<string, string>;
  vercelToken?: string;
};

export function createCredentialProvider(config: CredentialProviderConfig): CredentialProvider {
  const hasConnect =
    config.connectorMap &&
    Object.keys(config.connectorMap).length > 0 &&
    (process.env.VERCEL_OIDC_TOKEN || config.vercelToken);

  if (hasConnect) {
    return createConnectCredentialProvider({
      connectorMap: config.connectorMap!,
      vercelToken: config.vercelToken,
    });
  }

  if (config.directSecrets && Object.keys(config.directSecrets).length > 0) {
    return createDirectCredentialProvider(config.directSecrets);
  }

  return createDirectCredentialProvider({});
}

export { createConnectCredentialProvider } from "./connect-provider";
export { createDirectCredentialProvider } from "./direct-provider";
export type { ConnectionId, CredentialProvider, ScopedToken } from "./types";
