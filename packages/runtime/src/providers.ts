import type { CredentialProvider } from "@tags/connections";
import type { SandboxProvider } from "@tags/sandbox";
import type { S3Client } from "@aws-sdk/client-s3";
import type { R2Config } from "@tags/storage";

export type RuntimeProviderConfig = {
  slackBotToken?: string;
  vercelToken?: string;
  vercelTeamId?: string;
  vercelProjectId?: string;
  connectorLinear?: string;
  connectorSlack?: string;
  linearApiKey?: string;
  r2?: R2Config;
};

export type RuntimeProviders = {
  credentials: CredentialProvider;
  sandbox: SandboxProvider;
  r2?: {
    client: S3Client;
    config: R2Config;
  };
};

export async function createRuntimeProviders(
  config: RuntimeProviderConfig,
): Promise<RuntimeProviders> {
  const { createCredentialProvider } = await import("@tags/connections");
  const { createSandboxProvider } = await import("@tags/sandbox");

  const connectorMap: Record<string, string> = {};
  if (config.connectorLinear) connectorMap.linear = config.connectorLinear;
  if (config.connectorSlack) connectorMap.slack = config.connectorSlack;

  const directSecrets: Record<string, string> = {};
  if (config.slackBotToken) directSecrets.slack = config.slackBotToken;
  if (config.linearApiKey) directSecrets.linear = config.linearApiKey;

  const credentials = createCredentialProvider({
    connectorMap,
    directSecrets,
    vercelToken: config.vercelToken,
  });

  const sandbox = createSandboxProvider({
    teamId: config.vercelTeamId,
    projectId: config.vercelProjectId,
    token: config.vercelToken,
  });

  let r2: RuntimeProviders["r2"];
  if (config.r2) {
    const { createR2Client } = await import("@tags/storage");
    r2 = {
      client: createR2Client(config.r2),
      config: config.r2,
    };
  }

  return { credentials, sandbox, r2 };
}
