import type { TagsRunOutput } from "@tags/sandbox";

export class ApprovalPauseError extends Error {
  readonly kind = "approval_required" as const;

  constructor(
    public readonly payload: {
      requestId: string;
      approvalId: string;
      toolName: string;
      toolInput: unknown;
      invocationId: string;
    },
  ) {
    super("Approval required");
    this.name = "ApprovalPauseError";
  }
}

export class QuestionPauseError extends Error {
  readonly kind = "question_required" as const;

  constructor(
    public readonly payload: {
      requestId: string;
      questionId: string;
      questionText: string;
      invocationId: string;
    },
  ) {
    super("Question required");
    this.name = "QuestionPauseError";
  }
}

export type AgentSegmentResult =
  | { kind: "complete"; text: string; runOutput?: TagsRunOutput }
  | { kind: "failed"; text: string }
  | {
      kind: "approval_required";
      requestId: string;
      approvalId: string;
      toolName: string;
      toolInput: unknown;
      invocationId: string;
      riskLevel?: string;
      requestedBySlackUserId?: string;
      expiresAt?: string;
    }
  | {
      kind: "question_required";
      requestId: string;
      questionId: string;
      questionText: string;
      invocationId: string;
    };
