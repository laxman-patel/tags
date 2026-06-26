export type ConnectionId = string;

export interface ScopedToken {
  token: string;
  expiresAt: Date;
  scopes: string[];
}

export interface CredentialProvider {
  getToken(args: {
    organizationId: string;
    workspaceId: string;
    connectionId: ConnectionId;
    installationId?: string;
    scopes?: string[];
  }): Promise<ScopedToken>;

  verifyWebhook?(args: {
    connectionId: ConnectionId;
    headers: Headers;
    rawBody: string;
  }): Promise<boolean>;
}
