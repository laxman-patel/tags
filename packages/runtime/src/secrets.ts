import { getR2ConfigFromProcessEnv } from "@tags/storage";
import type { R2Config } from "@tags/storage";
import { z } from "zod";
import type { RuntimeProviderConfig } from "./providers";

const runtimeSecretsSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AI_GATEWAY_API_KEY: z.string().min(1),
  SLACK_BOT_TOKEN: z.string().min(1),
  VERCEL_TOKEN: z.string().optional(),
  LINEAR_API_KEY: z.string().optional(),
});

export type RuntimeSecrets = {
  databaseUrl: string;
  gatewayApiKey: string;
  slackBotToken: string;
  vercelToken?: string;
  linearApiKey?: string;
  r2?: R2Config;
};

export type RuntimeProviderSelectors = {
  vercelTeamId?: string;
  vercelProjectId?: string;
  connectorLinear?: string;
  connectorSlack?: string;
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
    gatewayApiKey: env.AI_GATEWAY_API_KEY,
    slackBotToken: env.SLACK_BOT_TOKEN,
    vercelToken: env.VERCEL_TOKEN,
    linearApiKey: env.LINEAR_API_KEY,
    ...(r2 ? { r2 } : {}),
  };
}

export function buildRuntimeProviderConfig(
  secrets: RuntimeSecrets,
  selectors: RuntimeProviderSelectors,
): RuntimeProviderConfig {
  const config: RuntimeProviderConfig = {
    slackBotToken: secrets.slackBotToken,
    vercelToken: secrets.vercelToken,
    vercelTeamId: selectors.vercelTeamId,
    vercelProjectId: selectors.vercelProjectId,
    connectorLinear: selectors.connectorLinear,
    connectorSlack: selectors.connectorSlack,
    linearApiKey: secrets.linearApiKey,
  };

  if (secrets.r2) {
    config.r2 = secrets.r2;
  }

  return config;
}
