import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@tags/db";
import {
  approvalRequests,
  newId,
  runEvents,
  runs,
  toolInvocations,
  withDbRlsScope,
  type RlsScope,
} from "@tags/db";

export type RunEventPayload = { type: string } & Record<string, unknown>;

export async function createRun(
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    threadId: string;
    spaceConfigVersion: number;
    modelId: string;
    trigger: "mention" | "reply" | "schedule" | "approval_response";
    idempotencyKey: string;
    inputMessageId?: string;
    workflowRunId?: string;
  },
): Promise<typeof runs.$inferSelect | null> {
  const existing = await db
    .select()
    .from(runs)
    .where(eq(runs.idempotencyKey, args.idempotencyKey))
    .limit(1);

  if (existing[0]) return null;

  const id = newId();
  const [row] = await db
    .insert(runs)
    .values({
      id,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      threadId: args.threadId,
      spaceConfigVersion: args.spaceConfigVersion,
      modelId: args.modelId,
      trigger: args.trigger,
      idempotencyKey: args.idempotencyKey,
      inputMessageId: args.inputMessageId,
      workflowRunId: args.workflowRunId,
      status: "queued",
    })
    .onConflictDoNothing({ target: runs.idempotencyKey })
    .returning();

  return row ?? null;
}

export async function appendRunEvent(
  db: Db,
  runId: string,
  event: RunEventPayload,
): Promise<void> {
  const payload = JSON.stringify(event);
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await db.execute(sql`
        insert into run_events (run_id, seq, event_type, payload)
        values (
          ${runId},
          coalesce((select max(seq) from run_events where run_id = ${runId}), 0) + 1,
          ${event.type},
          ${payload}::jsonb
        )
      `);
      return;
    } catch (error) {
      const isUniqueViolation =
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "23505";
      if (!isUniqueViolation || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }
}

export async function updateRunStatus(
  db: Db,
  runId: string,
  status: typeof runs.$inferSelect.status,
  extra?: {
    workflowRunId?: string;
    tokenUsage?: { prompt: number; completion: number; total: number };
    error?: { code: string; message: string };
    finishedAt?: Date;
  },
): Promise<void> {
  await db
    .update(runs)
    .set({
      status,
      workflowRunId: extra?.workflowRunId,
      tokenUsage: extra?.tokenUsage,
      error: extra?.error,
      finishedAt: extra?.finishedAt,
    })
    .where(eq(runs.id, runId));
}

export async function getRunById(
  db: Db,
  runId: string,
  scope?: Pick<RlsScope, "organizationId" | "spaceId">,
) {
  const runQuery = async (scopedDb: Db) => {
    const rows = await scopedDb.select().from(runs).where(eq(runs.id, runId)).limit(1);
    return rows[0];
  };

  if (scope) {
    return withDbRlsScope(db, scope, runQuery);
  }

  return runQuery(db);
}

export async function listRunEvents(
  db: Db,
  runId: string,
  scope?: Pick<RlsScope, "organizationId" | "spaceId">,
) {
  if (scope) {
    const run = await getRunById(db, runId, scope);
    if (!run) return [];
  }

  return db
    .select()
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(asc(runEvents.seq));
}

export async function listRunEventsAfter(
  db: Db,
  runId: string,
  afterSeq: number,
  scope?: Pick<RlsScope, "organizationId" | "spaceId">,
) {
  if (scope) {
    const run = await getRunById(db, runId, scope);
    if (!run) return [];
  }

  return db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), gt(runEvents.seq, afterSeq)))
    .orderBy(asc(runEvents.seq));
}

export async function createToolInvocation(
  db: Db,
  args: {
    runId: string;
    organizationId: string;
    spaceId: string;
    toolName: string;
    toolInput: unknown;
    idempotencyKey: string;
  },
): Promise<typeof toolInvocations.$inferSelect> {
  const existing = await db
    .select()
    .from(toolInvocations)
    .where(eq(toolInvocations.idempotencyKey, args.idempotencyKey))
    .limit(1);

  if (existing[0]) return existing[0];

  const id = newId();
  const [row] = await db
    .insert(toolInvocations)
    .values({
      id,
      runId: args.runId,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      toolName: args.toolName,
      toolInput: args.toolInput,
      idempotencyKey: args.idempotencyKey,
      status: "pending",
    })
    .returning();

  if (!row) throw new Error("Failed to create tool invocation");
  return row;
}

export async function completeToolInvocation(
  db: Db,
  invocationId: string,
  result: {
    status: "succeeded" | "failed";
    result?: unknown;
    error?: unknown;
    externalResourceKind?: string;
    externalResourceId?: string;
  },
): Promise<void> {
  await db
    .update(toolInvocations)
    .set({
      status: result.status,
      result: result.result,
      error: result.error,
      externalResourceKind: result.externalResourceKind,
      externalResourceId: result.externalResourceId,
      completedAt: new Date(),
    })
    .where(eq(toolInvocations.id, invocationId));
}

export async function createApprovalRequest(
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    runId: string;
    threadId: string;
    toolInvocationId: string;
    requestId: string;
    toolName: string;
    toolInput: unknown;
    riskLevel: "none" | "low" | "medium" | "high";
    requestText: string;
    expiresAt: Date;
    requestedByUserId?: string;
    requestedBySlackUserId?: string;
  },
): Promise<typeof approvalRequests.$inferSelect> {
  const id = newId();
  const [row] = await db
    .insert(approvalRequests)
    .values({
      id,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      runId: args.runId,
      threadId: args.threadId,
      toolInvocationId: args.toolInvocationId,
      requestId: args.requestId,
      toolName: args.toolName,
      toolInput: args.toolInput,
      riskLevel: args.riskLevel,
      requestText: args.requestText,
      expiresAt: args.expiresAt,
      requestedByUserId: args.requestedByUserId,
      requestedBySlackUserId: args.requestedBySlackUserId,
      status: "pending",
    })
    .returning();

  if (!row) throw new Error("Failed to create approval request");
  return row;
}

export async function resolveApprovalRequest(
  db: Db,
  approvalId: string,
  decision: "approved" | "rejected",
  resolvedByUserId?: string,
): Promise<typeof approvalRequests.$inferSelect | null> {
  const [row] = await db
    .update(approvalRequests)
    .set({
      status: decision,
      resolvedByUserId,
      resolvedAt: new Date(),
    })
    .where(and(eq(approvalRequests.id, approvalId), eq(approvalRequests.status, "pending")))
    .returning();

  return row ?? null;
}

export async function resolveApprovalByRequestId(
  db: Db,
  requestId: string,
  decision: "approved" | "rejected",
  resolvedByUserId?: string,
): Promise<typeof approvalRequests.$inferSelect | null> {
  const [row] = await db
    .update(approvalRequests)
    .set({
      status: decision,
      resolvedByUserId,
      resolvedAt: new Date(),
    })
    .where(
      and(eq(approvalRequests.requestId, requestId), eq(approvalRequests.status, "pending")),
    )
    .returning();

  return row ?? null;
}

export async function expireApprovalByRequestId(
  db: Db,
  requestId: string,
): Promise<typeof approvalRequests.$inferSelect | null> {
  const [row] = await db
    .update(approvalRequests)
    .set({
      status: "expired",
      resolvedAt: new Date(),
    })
    .where(
      and(eq(approvalRequests.requestId, requestId), eq(approvalRequests.status, "pending")),
    )
    .returning();

  return row ?? null;
}

export async function listPendingApprovals(db: Db, organizationId: string) {
  return db
    .select()
    .from(approvalRequests)
    .where(
      and(eq(approvalRequests.organizationId, organizationId), eq(approvalRequests.status, "pending")),
    )
    .orderBy(desc(approvalRequests.createdAt));
}
