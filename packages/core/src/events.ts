import type { UICard } from "./ui-cards";

export type TagsEvent =
  | { type: "text.delta"; text: string }
  | { type: "status"; label: string; detail?: string }
  /** Short live subtitle under an in-flight tool (e.g. opencode step). */
  | { type: "tool.progress"; toolName: string; step: string }
  | { type: "tool.started"; toolName: string; inputPreview: unknown }
  | { type: "tool.finished"; toolName: string; outputPreview: unknown; uiCard?: UICard }
  | {
      type: "approval.requested";
      approvalId: string;
      requestId: string;
      toolName?: string;
      riskLevel?: string;
      requestText?: string;
      inputPreview?: unknown;
      requestedBySlackUserId?: string;
      expiresAt?: string;
    }
  | {
      type: "question.requested";
      questionId: string;
      requestId: string;
      questionText?: string;
      expiresAt?: string;
    }
  | { type: "artifact.created"; artifactId: string; artifactUrl: string; artifactTitle: string }
  | { type: "recording.started"; prUrl?: string; demoKind?: string }
  | {
      type: "recording.finished";
      artifactId: string;
      artifactUrl: string;
      prUrl?: string;
      slackFileId?: string;
      prCommentUrl?: string;
    }
  | { type: "recording.failed"; error: string; prUrl?: string }
  | { type: "run.finished" }
  | { type: "run.failed"; error: string };
