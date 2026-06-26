import type { CredentialProvider, ScopedToken } from "./types";

export type DirectCredentialSecrets = Record<string, string>;

export function createDirectCredentialProvider(
  secrets: DirectCredentialSecrets,
): CredentialProvider {
  return {
    async getToken(args): Promise<ScopedToken> {
      const token = secrets[args.connectionId];
      if (!token) {
        throw new Error(`No direct credential configured for ${args.connectionId}`);
      }

      return {
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scopes: args.scopes ?? [],
      };
    },
  };
}
