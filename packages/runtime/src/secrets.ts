import { getR2ConfigFromProcessEnv } from "@tags/storage";
import type { R2Config } from "@tags/storage";
import { z } from "zod";
import type { RuntimeProviderConfig } from "./providers";

const runtimeSecretsSchema = z.object({
  DATABASE_URL: z.string().min(1),
  FIREWORKS_API_KEY: z.string().min(1),
  SLACK_BOT_TOKEN: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  E2B_API_KEY: z.string().optional(),
  E2B_OPENCODE_TEMPLATE: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  COMPOSIO_API_KEY: z.string().optional(),
  OPENCODE_MODEL: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
});

export type RuntimeSecrets = {
  databaseUrl: string;
  fireworksApiKey: string;
  slackBotToken: string;
  appUrl: string;
  e2bApiKey?: string;
  e2bOpencodeTemplate?: string;
  githubToken?: string;
  composioApiKey?: string;
  opencodeModel?: string;
  mcpSigningKey?: string;
  r2?: R2Config;
};

export function loadRuntimeSecrets(): RuntimeSecrets {
  const parsed = runtimeSecretsSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid runtime environment:\n${message}`);
  }

  const env = parsed.data;
  const r2 = getR2ConfigFromProcessEnv();

  return {
    databaseUrl: env.DATABASE_URL,
    fireworksApiKey: env.FIREWORKS_API_KEY,
    slackBotToken: env.SLACK_BOT_TOKEN,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    e2bApiKey: env.E2B_API_KEY,
    e2bOpencodeTemplate: env.E2B_OPENCODE_TEMPLATE,
    githubToken: env.GITHUB_TOKEN,
    composioApiKey: env.COMPOSIO_API_KEY,
    opencodeModel: env.OPENCODE_MODEL,
    mcpSigningKey: env.INNGEST_SIGNING_KEY,
    ...(r2 ? { r2 } : {}),
  };
}

export function buildRuntimeProviderConfig(secrets: RuntimeSecrets): RuntimeProviderConfig {
  const config: RuntimeProviderConfig = {
    slackBotToken: secrets.slackBotToken,
    composioApiKey: secrets.composioApiKey,
    e2bApiKey: secrets.e2bApiKey,
    e2bOpencodeTemplate: secrets.e2bOpencodeTemplate,
    githubToken: secrets.githubToken,
    fireworksApiKey: secrets.fireworksApiKey,
    opencodeModel: secrets.opencodeModel,
    mcpSigningKey: secrets.mcpSigningKey,
  };

  if (secrets.r2) {
    config.r2 = secrets.r2;
  }

  return config;
}
