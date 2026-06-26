import { createHash } from "node:crypto";
import { z } from "zod";

export type ToolRiskLevel = "none" | "low" | "medium" | "high";

export type ApprovalPolicy =
  | { kind: "never" }
  | { kind: "once" }
  | { kind: "always" }
  | { kind: "predicate"; needsApproval: (input: unknown) => boolean };

export interface ToolContext {
  organizationId: string;
  spaceId: string;
  threadId: string;
  runId: string;
  actorUserId: string | null;
  emit: (event: import("@tags/core/events").TagsEvent) => Promise<void>;
}

export interface ToolResult {
  modelOutput: unknown;
  artifact?: { kind: string; title: string; contentRef?: string; metadata?: unknown };
  externalResource?: { kind: string; id: string };
}

export interface TagsTool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  risk: ToolRiskLevel;
  approval: ApprovalPolicy;
  sideEffecting: boolean;
  execute: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

export function toolIdempotencyKey(
  runId: string,
  toolName: string,
  input: unknown,
): string {
  const canonical = JSON.stringify(input);
  const hash = createHash("sha256").update(canonical).digest("hex");
  return `run:${runId}:${toolName}:${hash}`;
}
