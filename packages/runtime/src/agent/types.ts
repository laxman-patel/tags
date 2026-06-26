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

export type AgentSegmentResult =
  | { kind: "complete"; text: string }
  | {
      kind: "approval_required";
      requestId: string;
      approvalId: string;
      toolName: string;
      toolInput: unknown;
      invocationId: string;
    };
