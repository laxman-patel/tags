import type { TagsEvent } from "@tags/core/events";
import { getApprovalPolicyForSpace } from "@tags/core/policies";
import {
  createApprovalRequest,
  createToolInvocation,
} from "@tags/core/runs";
import type { Db } from "@tags/db";
import { newId } from "@tags/db";
import { toolIdempotencyKey } from "./types";
import { ApprovalPauseError } from "../agent/types";

export type ApprovedToolMatch = {
  requestId: string;
  toolName: string;
  idempotencyKey: string;
};

export type ApprovalGateArgs = {
  db: Db;
  runId: string;
  organizationId: string;
  spaceId: string;
  threadId: string;
  toolName: string;
  toolInput: unknown;
  actorUserId?: string | null;
  approvedTool?: ApprovedToolMatch;
  emit: (event: TagsEvent) => Promise<void>;
};

export function isApprovedToolMatch(
  approvedTool: ApprovedToolMatch | undefined,
  toolName: string,
  idempotencyKey: string,
): boolean {
  if (!approvedTool) return false;
  return (
    approvedTool.toolName === toolName && approvedTool.idempotencyKey === idempotencyKey
  );
}

/**
 * Shared approval gate for side-effecting tools (native TagsTools and Composio MCP).
 * When no matching approvedTool is present, creates an approval request and pauses the run.
 */
export async function gateSideEffectingTool(
  args: ApprovalGateArgs,
): Promise<{ cachedResult?: unknown }> {
  const idempotencyKey = toolIdempotencyKey(args.runId, args.toolName, args.toolInput);
  if (isApprovedToolMatch(args.approvedTool, args.toolName, idempotencyKey)) {
    return {};
  }

  const invocation = await createToolInvocation(args.db, {
    runId: args.runId,
    organizationId: args.organizationId,
    spaceId: args.spaceId,
    toolName: args.toolName,
    toolInput: args.toolInput,
    idempotencyKey,
  });

  if (invocation.status === "succeeded" && invocation.result) {
    return { cachedResult: invocation.result };
  }

  const policy = await getApprovalPolicyForSpace(args.db, args.spaceId);
  const expiryMinutes = policy?.defaultExpiryMinutes ?? 60;

  const requestId = newId();
  const approval = await createApprovalRequest(args.db, {
    organizationId: args.organizationId,
    spaceId: args.spaceId,
    runId: args.runId,
    threadId: args.threadId,
    toolInvocationId: invocation.id,
    requestId,
    toolName: args.toolName,
    toolInput: args.toolInput,
    riskLevel: "high",
    requestText: `Approve ${args.toolName}?`,
    expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
    requestedBySlackUserId: args.actorUserId ?? undefined,
  });

  await args.emit({
    type: "approval.requested",
    approvalId: approval.id,
    requestId,
  });

  throw new ApprovalPauseError({
    requestId,
    approvalId: approval.id,
    toolName: args.toolName,
    toolInput: args.toolInput,
    invocationId: invocation.id,
  });
}
