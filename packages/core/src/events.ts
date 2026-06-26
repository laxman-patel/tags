export type TagsEvent =
  | { type: "text.delta"; text: string }
  | { type: "status"; label: string; detail?: string }
  | { type: "tool.started"; toolName: string; inputPreview: unknown }
  | { type: "tool.finished"; toolName: string; outputPreview: unknown }
  | { type: "approval.requested"; approvalId: string; requestId: string }
  | { type: "question.requested"; questionId: string; requestId: string }
  | { type: "artifact.created"; artifactId: string; artifactUrl: string; artifactTitle: string }
  | { type: "run.finished" }
  | { type: "run.failed"; error: string };
