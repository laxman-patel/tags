import { metrics, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

export const webTracer = trace.getTracer("tags.web");
export const webMeter = metrics.getMeter("tags.web");
export const webLogger = logs.getLogger("tags.web");

export const slackEventsReceived = webMeter.createCounter("slack.events.received", {
  description: "Slack events received by outcome.",
});

export const spacesRequestsCompleted = webMeter.createCounter("spaces.requests.completed", {
  description: "Spaces API requests completed by method and outcome.",
});

export function emitWebInfo(body: string, attributes: Record<string, string | number | boolean | undefined>) {
  webLogger.emit({
    severityNumber: SeverityNumber.INFO,
    severityText: "INFO",
    body,
    attributes: dropUndefined(attributes),
  });
}

export function emitWebWarn(body: string, attributes: Record<string, string | number | boolean | undefined>) {
  webLogger.emit({
    severityNumber: SeverityNumber.WARN,
    severityText: "WARN",
    body,
    attributes: dropUndefined(attributes),
  });
}

function dropUndefined(attributes: Record<string, string | number | boolean | undefined>) {
  return Object.fromEntries(
    Object.entries(attributes).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined),
  );
}
