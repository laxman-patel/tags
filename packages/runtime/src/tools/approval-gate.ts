import type { TagsEvent } from "@tags/core/events";
import {
  createApprovalRequest,
  createToolInvocation,
} from "@tags/core/runs";
import type { Db } from "@tags/db";
import { newId } from "@tags/db";
import { toolIdempotencyKey } from "./types";
import { ApprovalPauseError } from "../agent/types";

export type ApprovalGateArgs = {
  db: Db;
  runId: string;
  organizationId: string;
  spaceId: string;
  threadId: string;
  toolName: string;
  toolInput: unknown;
  approvedRequestId?: string;
  emit: (event: TagsEvent) => Promise<void>;
};

/**
 * Shared approval gate for side-effecting tools (native TagsTools and Composio MCP).
 * When `approvedRequestId` is absent, creates an approval request and pauses the run.
 */
export async function gateSideEffectingTool(
  args: ApprovalGateArgs,
): Promise<{ cachedResult?: unknown }> {
  if (args.approvedRequestId) return {};

  const idempotencyKey = toolIdempotencyKey(args.runId, args.toolName, args.toolInput);
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
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
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
