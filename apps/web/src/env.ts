import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),
  DATABASE_MIGRATE_URL: z.string().optional(),
  AI_GATEWAY_API_KEY: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),
  SLACK_BOT_TOKEN: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  /** Comma-separated Clerk user IDs allowed as admin when org roles are not configured. */
  ADMIN_USER_IDS: z.string().optional(),
  /** Comma-separated emails allowed as admin when org roles are not configured. */
  ADMIN_EMAILS: z.string().optional(),
  /** Bearer token required for /api/cron/schedules (Vercel Cron). */
  CRON_SECRET: z.string().min(1),
  SENTRY_DSN: z.string().optional(),
  VERCEL_TOKEN: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),
  CONNECTOR_LINEAR: z.string().optional(),
  CONNECTOR_SLACK: z.string().optional(),
  LINEAR_API_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${message}`);
  }
  return parsed.data;
}

/** Non-secret provider routing selectors passed into durable workflow input. */
export function getWorkflowEnvExtras(env: Env) {
  return {
    vercelTeamId: env.VERCEL_TEAM_ID,
    vercelProjectId: env.VERCEL_PROJECT_ID,
    connectorLinear: env.CONNECTOR_LINEAR,
    connectorSlack: env.CONNECTOR_SLACK,
  };
}
