import type { CredentialProvider } from "@tags/connections";
import type { SandboxProvider } from "@tags/sandbox";
import type { S3Client } from "@aws-sdk/client-s3";
import type { R2Config } from "@tags/storage";

export type RuntimeProviderConfig = {
  slackBotToken?: string;
  composioApiKey?: string;
  e2bApiKey?: string;
  /** Fireworks key — registered with opencode auth before sandbox runs. */
  fireworksApiKey?: string;
  /** E2B template name (default: pre-built `opencode` template). */
  e2bOpencodeTemplate?: string;
  /** E2B desktop template used for post-change demo recording. */
  e2bDemoTemplate?: string;
  r2?: R2Config;
  /** Signs short-lived run tokens for the Tags MCP bridge used by opencode. */
  mcpSigningKey?: string;
  demoRecording?: {
    maxSeconds: number;
    width: number;
    height: number;
    fps: number;
  };
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

  if (!config.fireworksApiKey?.trim()) {
    throw new Error("FIREWORKS_API_KEY is required to create the runtime sandbox provider");
  }

  const sandbox = createSandboxProvider({
    apiKey: config.e2bApiKey,
    template: config.e2bOpencodeTemplate,
    modelApiKey: config.fireworksApiKey,
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
