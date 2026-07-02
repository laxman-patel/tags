import * as Sentry from "@sentry/node";

export function setSentryRunContext(context: {
  organizationId?: string;
  spaceId?: string;
  runId?: string;
}) {
  if (!process.env.SENTRY_DSN) return;

  Sentry.setTags({
    ...(context.organizationId ? { organization_id: context.organizationId } : {}),
    ...(context.spaceId ? { space_id: context.spaceId } : {}),
    ...(context.runId ? { run_id: context.runId } : {}),
  });
}
