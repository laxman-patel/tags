import type { TagsEvent } from "@tags/core/events";
import type { UICard } from "@tags/core/ui-cards";

export function parseTagsEvent(
  eventType: string,
  payload: unknown,
): TagsEvent | null {
  if (payload && typeof payload === "object" && "type" in payload) {
    const typed = payload as TagsEvent;
    if (typed.type === eventType) return typed;
  }

  switch (eventType) {
    case "text.delta":
      return {
        type: "text.delta",
        text: String((payload as { text?: string })?.text ?? ""),
      };
    case "status":
      return {
        type: "status",
        label: String((payload as { label?: string })?.label ?? "Status"),
        detail: (payload as { detail?: string })?.detail,
      };
    case "tool.started":
      return {
        type: "tool.started",
        toolName: String((payload as { toolName?: string })?.toolName ?? "tool"),
        inputPreview: (payload as { inputPreview?: unknown })?.inputPreview,
      };
    case "tool.progress":
      return {
        type: "tool.progress",
        toolName: String((payload as { toolName?: string })?.toolName ?? "tool"),
        step: String((payload as { step?: string })?.step ?? ""),
      };
    case "tool.finished":
      return {
        type: "tool.finished",
        toolName: String((payload as { toolName?: string })?.toolName ?? "tool"),
        outputPreview: (payload as { outputPreview?: unknown })?.outputPreview,
        uiCard: (payload as { uiCard?: UICard })?.uiCard,
      };
    case "approval.requested":
      return {
        type: "approval.requested",
        approvalId: String((payload as { approvalId?: string })?.approvalId ?? ""),
        requestId: String((payload as { requestId?: string })?.requestId ?? ""),
      };
    case "question.requested":
      return {
        type: "question.requested",
        questionId: String((payload as { questionId?: string })?.questionId ?? ""),
        requestId: String((payload as { requestId?: string })?.requestId ?? ""),
      };
    case "artifact.created":
      return {
        type: "artifact.created",
        artifactId: String((payload as { artifactId?: string })?.artifactId ?? ""),
        artifactUrl: String((payload as { artifactUrl?: string })?.artifactUrl ?? ""),
        artifactTitle: String((payload as { artifactTitle?: string })?.artifactTitle ?? ""),
      };
    case "recording.started":
      return {
        type: "recording.started",
        prUrl: (payload as { prUrl?: string })?.prUrl,
        demoKind: (payload as { demoKind?: string })?.demoKind,
      };
    case "recording.finished":
      return {
        type: "recording.finished",
        artifactId: String((payload as { artifactId?: string })?.artifactId ?? ""),
        artifactUrl: String((payload as { artifactUrl?: string })?.artifactUrl ?? ""),
        prUrl: (payload as { prUrl?: string })?.prUrl,
        slackFileId: (payload as { slackFileId?: string })?.slackFileId,
        prCommentUrl: (payload as { prCommentUrl?: string })?.prCommentUrl,
      };
    case "recording.failed":
      return {
        type: "recording.failed",
        error: String((payload as { error?: string })?.error ?? "Recording failed"),
        prUrl: (payload as { prUrl?: string })?.prUrl,
      };
    case "run.finished":
      return { type: "run.finished" };
    case "run.failed":
      return {
        type: "run.failed",
        error: String((payload as { error?: string })?.error ?? "Unknown error"),
      };
    default:
      return null;
  }
}
