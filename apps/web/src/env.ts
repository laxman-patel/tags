import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.string().min(1),
    DATABASE_MIGRATE_URL: z.string().optional(),
    FIREWORKS_API_KEY: z.string().min(1),
    SLACK_SIGNING_SECRET: z.string().min(1),
    SLACK_BOT_TOKEN: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    CLERK_SECRET_KEY: z.string().min(1),
    /** Comma-separated Clerk user IDs allowed as admin when org roles are not configured. */
    ADMIN_USER_IDS: z.string().optional(),
    /** Comma-separated emails allowed as admin when org roles are not configured. */
    ADMIN_EMAILS: z.string().optional(),
    SENTRY_DSN: z.string().optional(),
    /** E2B sandbox API key (opencode coding agent). */
    E2B_API_KEY: z.string().optional(),
    /** opencode model string for the sandbox coding agent. */
    OPENCODE_MODEL: z.string().optional(),
    COMPOSIO_API_KEY: z.string().optional(),
    /** Inngest cloud keys (optional in local dev with the Inngest Dev Server). */
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_PUBLIC_BASE_URL: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      if (!data.INNGEST_EVENT_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["INNGEST_EVENT_KEY"],
          message: "Required in production",
        });
      }
      if (!data.INNGEST_SIGNING_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["INNGEST_SIGNING_KEY"],
          message: "Required in production",
        });
      }
    }
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
