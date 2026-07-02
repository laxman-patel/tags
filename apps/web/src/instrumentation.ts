import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("./env");
    const env = getEnv();

    if (env.SENTRY_DSN) {
      Sentry.init({
        dsn: env.SENTRY_DSN,
        tracesSampleRate: 0.1,
        beforeSend(event) {
          if (event.request?.data && typeof event.request.data === "string") {
            delete event.request.data;
          }
          return event;
        },
      });
    }
  }
}

export function setSentryRunContext(context: {
  organizationId?: string;
  spaceId?: string;
  runId?: string;
}) {
  Sentry.setTags({
    ...(context.organizationId ? { organization_id: context.organizationId } : {}),
    ...(context.spaceId ? { space_id: context.spaceId } : {}),
    ...(context.runId ? { run_id: context.runId } : {}),
  });
}
