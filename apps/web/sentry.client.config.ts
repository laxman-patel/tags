import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    if (event.request?.data && typeof event.request.data === "string") {
      delete event.request.data;
    }
    return event;
  },
});
