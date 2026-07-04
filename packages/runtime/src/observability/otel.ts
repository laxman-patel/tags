import { metrics, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

export const tagsTracer = trace.getTracer("tags.runtime");
export const tagsMeter = metrics.getMeter("tags.runtime");
export const tagsLogger = logs.getLogger("tags.runtime");

export const agentRunsStarted = tagsMeter.createCounter("agent.runs.started", {
  description: "Agent runs started by trigger and outcome.",
});

export const agentRunsCompleted = tagsMeter.createCounter("agent.runs.completed", {
  description: "Agent runs completed by outcome.",
});

export const agentRunDuration = tagsMeter.createHistogram("agent.run.duration", {
  description: "Agent run duration in milliseconds.",
  unit: "ms",
});

export const agentSegmentsCompleted = tagsMeter.createCounter("agent.segments.completed", {
  description: "Agent segments completed by outcome.",
});

export const toolExecutionsCompleted = tagsMeter.createCounter("tools.executions.completed", {
  description: "Tool executions completed by tool and outcome.",
});

export function emitInfo(body: string, attributes: Record<string, string | number | boolean | undefined>) {
  tagsLogger.emit({
    severityNumber: SeverityNumber.INFO,
    severityText: "INFO",
    body,
    attributes: dropUndefined(attributes),
  });
}

export function emitWarn(body: string, attributes: Record<string, string | number | boolean | undefined>) {
  tagsLogger.emit({
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
