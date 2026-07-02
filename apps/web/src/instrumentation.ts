import * as Sentry from "@sentry/nextjs";

export { setSentryRunContext } from "@tags/runtime/observability/sentry";

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
