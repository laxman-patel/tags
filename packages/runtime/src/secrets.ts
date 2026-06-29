import { getR2ConfigFromProcessEnv } from "@tags/storage";
import type { R2Config } from "@tags/storage";
import { z } from "zod";
import type { RuntimeProviderConfig } from "./providers";

const runtimeSecretsSchema = z.object({
  DATABASE_URL: z.string().min(1),
  FIREWORKS_API_KEY: z.string().min(1),
  SLACK_BOT_TOKEN: z.string().min(1),
  E2B_API_KEY: z.string().optional(),
  COMPOSIO_API_KEY: z.string().optional(),
  OPENCODE_MODEL: z.string().optional(),
});

export type RuntimeSecrets = {
  databaseUrl: string;
  fireworksApiKey: string;
  slackBotToken: string;
  e2bApiKey?: string;
  composioApiKey?: string;
  opencodeModel?: string;
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
    e2bApiKey: env.E2B_API_KEY,
    composioApiKey: env.COMPOSIO_API_KEY,
    opencodeModel: env.OPENCODE_MODEL,
    ...(r2 ? { r2 } : {}),
  };
}

export function buildRuntimeProviderConfig(secrets: RuntimeSecrets): RuntimeProviderConfig {
  const config: RuntimeProviderConfig = {
    slackBotToken: secrets.slackBotToken,
    composioApiKey: secrets.composioApiKey,
    e2bApiKey: secrets.e2bApiKey,
    fireworksApiKey: secrets.fireworksApiKey,
    opencodeModel: secrets.opencodeModel,
  };

  if (secrets.r2) {
    config.r2 = secrets.r2;
  }

  return config;
}
