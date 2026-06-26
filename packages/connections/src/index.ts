import { createConnectCredentialProvider } from "./connect-provider";
import { createDirectCredentialProvider } from "./direct-provider";
import type { CredentialProvider } from "./types";

export type CredentialProviderConfig = {
  connectorMap?: Record<string, string>;
  directSecrets?: Record<string, string>;
  vercelToken?: string;
  oidcToken?: string;
};

export function createCredentialProvider(config: CredentialProviderConfig): CredentialProvider {
  const connectorMap = config.connectorMap ?? {};
  const directSecrets = config.directSecrets ?? {};
  const connectAuthAvailable = Boolean(config.oidcToken || config.vercelToken);

  const connectProvider =
    Object.keys(connectorMap).length > 0 && connectAuthAvailable
      ? createConnectCredentialProvider({
          connectorMap,
          vercelToken: config.vercelToken,
          oidcToken: config.oidcToken,
        })
      : null;

  const directProvider = createDirectCredentialProvider(directSecrets);

  return {
    async getToken(args) {
      const connector = connectorMap[args.connectionId];
      const directSecret = directSecrets[args.connectionId];

      if (connector && connectProvider) {
        return connectProvider.getToken(args);
      }

      if (directSecret) {
        return directProvider.getToken(args);
      }

      if (connector && !connectAuthAvailable) {
        throw new Error(
          `Connect connector configured for ${args.connectionId} but no OIDC or Vercel token supplied`,
        );
      }

      throw new Error(`No credential configured for ${args.connectionId}`);
    },
  };
}

export { createConnectCredentialProvider } from "./connect-provider";
export { createDirectCredentialProvider } from "./direct-provider";
export type { ConnectionId, CredentialProvider, ScopedToken } from "./types";
