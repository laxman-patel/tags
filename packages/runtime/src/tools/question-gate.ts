import type { Db } from "@tags/db";
import type { TagsEvent } from "@tags/core/events";
import { getApprovalPolicyForSpace } from "@tags/core/policies";
import { createQuestionRequest } from "@tags/core/questions";
import { createToolInvocation } from "@tags/core/runs";
import { newId } from "@tags/db";
import { toolIdempotencyKey } from "./types";
import { QuestionPauseError } from "../agent/types";

export type QuestionGateArgs = {
  db: Db;
  runId: string;
  organizationId: string;
  spaceId: string;
  threadId: string;
  toolName: string;
  toolInput: unknown;
  questionText: string;
  emit: (event: TagsEvent) => Promise<void>;
};

export async function gateQuestionTool(args: QuestionGateArgs): Promise<{ cachedResult?: unknown }> {
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

  const policy = await getApprovalPolicyForSpace(args.db, args.spaceId);
  const expiryMinutes = policy?.defaultExpiryMinutes ?? 60;
  const requestId = newId();

  const question = await createQuestionRequest(args.db, {
    organizationId: args.organizationId,
    spaceId: args.spaceId,
    runId: args.runId,
    threadId: args.threadId,
    toolInvocationId: invocation.id,
    requestId,
    questionText: args.questionText,
    expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
  });

  await args.emit({
    type: "question.requested",
    questionId: question.id,
    requestId,
    questionText: args.questionText,
    expiresAt: question.expiresAt.toISOString(),
  });

  throw new QuestionPauseError({
    requestId,
    questionId: question.id,
    questionText: args.questionText,
    invocationId: invocation.id,
  });
}
