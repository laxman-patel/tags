import type { CredentialProvider, ScopedToken } from "./types";

export type ConnectCredentialProviderConfig = {
  connectorMap: Record<string, string>;
  vercelToken?: string;
};

export function createConnectCredentialProvider(
  config: ConnectCredentialProviderConfig,
): CredentialProvider {
  return {
    async getToken(args): Promise<ScopedToken> {
      const connector = config.connectorMap[args.connectionId];
      if (!connector) {
        throw new Error(`No Connect connector configured for ${args.connectionId}`);
      }

      const { getTokenResponse } = await import("@vercel/connect");
      const response = await getTokenResponse(
        connector,
        {
          subject: { type: "app" },
          installationId: args.installationId,
          scopes: args.scopes,
        },
        config.vercelToken ? { vercelToken: config.vercelToken } : undefined,
      );

      return {
        token: response.token,
        expiresAt: new Date(response.expiresAt),
        scopes: args.scopes ?? [],
      };
    },
  };
}
