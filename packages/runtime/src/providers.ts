import type { CredentialProvider } from "@tags/connections";
import type { SandboxProvider } from "@tags/sandbox";
import type { S3Client } from "@aws-sdk/client-s3";
import type { R2Config } from "@tags/storage";

export type RuntimeProviderConfig = {
  slackBotToken?: string;
  composioApiKey?: string;
  e2bApiKey?: string;
  /** Fireworks key opencode uses for inference inside the sandbox. */
  fireworksApiKey?: string;
  /** opencode model string for the sandbox coding agent. */
  opencodeModel?: string;
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

  const directSecrets: Record<string, string> = {};
  if (config.slackBotToken) directSecrets.slack = config.slackBotToken;

  const credentials = createCredentialProvider({ directSecrets });

  const sandbox = createSandboxProvider({
    apiKey: config.e2bApiKey,
    modelApiKey: config.fireworksApiKey,
    model: config.opencodeModel,
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
