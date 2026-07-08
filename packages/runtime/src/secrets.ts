import { getR2ConfigFromProcessEnv } from "@tags/storage";
import type { R2Config } from "@tags/storage";
import { z } from "zod";
import type { RuntimeProviderConfig } from "./providers";

const runtimeSecretsSchema = z.object({
  DATABASE_URL: z.string().min(1),
  FIREWORKS_API_KEY: z.string().min(1),
  SLACK_BOT_TOKEN: z.string().optional(),
  TAGS_ENCRYPTION_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  E2B_API_KEY: z.string().optional(),
  E2B_OPENCODE_TEMPLATE: z.string().optional(),
  E2B_DEMO_TEMPLATE: z.string().default("tags-demo-desktop"),
  COMPOSIO_API_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  DEMO_RECORDING_MAX_SECONDS: z.coerce.number().int().positive().default(90),
  DEMO_RECORDING_WIDTH: z.coerce.number().int().positive().default(1280),
  DEMO_RECORDING_HEIGHT: z.coerce.number().int().positive().default(800),
  DEMO_RECORDING_FPS: z.coerce.number().int().positive().default(15),
});

export type RuntimeSecrets = {
  databaseUrl: string;
  fireworksApiKey: string;
  slackBotToken?: string;
  encryptionKey?: string;
  appUrl: string;
  e2bApiKey?: string;
  e2bOpencodeTemplate?: string;
  e2bDemoTemplate: string;
  composioApiKey?: string;
  mcpSigningKey?: string;
  r2?: R2Config;
  demoRecording: {
    maxSeconds: number;
    width: number;
    height: number;
    fps: number;
  };
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
    encryptionKey: env.TAGS_ENCRYPTION_KEY,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    e2bApiKey: env.E2B_API_KEY,
    e2bOpencodeTemplate: env.E2B_OPENCODE_TEMPLATE,
    e2bDemoTemplate: env.E2B_DEMO_TEMPLATE,
    composioApiKey: env.COMPOSIO_API_KEY,
    mcpSigningKey: env.INNGEST_SIGNING_KEY,
    demoRecording: {
      maxSeconds: env.DEMO_RECORDING_MAX_SECONDS,
      width: env.DEMO_RECORDING_WIDTH,
      height: env.DEMO_RECORDING_HEIGHT,
      fps: env.DEMO_RECORDING_FPS,
    },
    ...(r2 ? { r2 } : {}),
  };
}

export function buildRuntimeProviderConfig(
  secrets: RuntimeSecrets,
  overrides?: { slackBotToken?: string },
): RuntimeProviderConfig {
  const config: RuntimeProviderConfig = {
    slackBotToken: overrides?.slackBotToken ?? secrets.slackBotToken,
    composioApiKey: secrets.composioApiKey,
    e2bApiKey: secrets.e2bApiKey,
    e2bOpencodeTemplate: secrets.e2bOpencodeTemplate,
    e2bDemoTemplate: secrets.e2bDemoTemplate,
    fireworksApiKey: secrets.fireworksApiKey,
    mcpSigningKey: secrets.mcpSigningKey,
    demoRecording: secrets.demoRecording,
  };

  if (secrets.r2) {
    config.r2 = secrets.r2;
  }

  return config;
}
