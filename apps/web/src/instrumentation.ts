import * as Sentry from "@sentry/nextjs";

export { setSentryRunContext } from "@tags/runtime/observability/sentry";

const SUPERLOG_ENDPOINT = "https://intake.superlog.sh";
const SUPERLOG_PUBLIC_TOKEN = "sl_public_l2PXezhEsjZsVJ-UIf9s8koHF9X0VTw5eAtph0p8fHU";
const REPOSITORY_URL = "https://github.com/laxman-patel/tags";

function superlogHeaders(token: string): Record<string, string> {
  return { "x-api-key": token };
}

function deploymentEnvironmentName(): string {
  const value = process.env.VERCEL_ENV ?? process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV;
  if (value === "production") return "production";
  if (value === "preview") return "preview";
  if (value === "development" || value === "test") return value;
  return value || "local";
}

function vcsRevision(): string | undefined {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.SOURCE_COMMIT ??
    process.env.GIT_COMMIT ??
    process.env.HEROKU_SLUG_COMMIT
  );
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { OTLPLogExporter } = await import("@opentelemetry/exporter-logs-otlp-http");
    const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-http");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    const { PeriodicExportingMetricReader } = await import("@opentelemetry/sdk-metrics");
    const { BatchLogRecordProcessor } = await import("@opentelemetry/sdk-logs");
    const { registerOTel } = await import("@vercel/otel");

    registerOTel({
      serviceName: "tags-web",
      attributes: {
        "service.version": process.env.VERCEL_DEPLOYMENT_ID ?? process.env.RAILWAY_DEPLOYMENT_ID ?? "local",
        "deployment.environment.name": deploymentEnvironmentName(),
        "vcs.repository.url.full": REPOSITORY_URL,
        ...(vcsRevision() ? { "vcs.ref.head.revision": vcsRevision() } : {}),
      },
      traceExporter: new OTLPTraceExporter({
        url: `${SUPERLOG_ENDPOINT}/v1/traces`,
        headers: superlogHeaders(SUPERLOG_PUBLIC_TOKEN),
      }),
      metricReaders: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: `${SUPERLOG_ENDPOINT}/v1/metrics`,
            headers: superlogHeaders(SUPERLOG_PUBLIC_TOKEN),
          }),
        }),
      ],
      logRecordProcessors: [
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            url: `${SUPERLOG_ENDPOINT}/v1/logs`,
            headers: superlogHeaders(SUPERLOG_PUBLIC_TOKEN),
          }),
        }),
      ],
    });

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
