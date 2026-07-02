import { and, eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, questionRequests } from "@tags/db";

export async function createQuestionRequest(
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    runId: string;
    threadId: string;
    toolInvocationId: string;
    requestId: string;
    questionText: string;
    expiresAt: Date;
  },
): Promise<typeof questionRequests.$inferSelect> {
  const id = newId();
  const [row] = await db
    .insert(questionRequests)
    .values({
      id,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      runId: args.runId,
      threadId: args.threadId,
      toolInvocationId: args.toolInvocationId,
      requestId: args.requestId,
      questionText: args.questionText,
      expiresAt: args.expiresAt,
      status: "pending",
    })
    .returning();

  if (!row) throw new Error("Failed to create question request");
  return row;
}

export async function answerQuestionByRequestId(
  db: Db,
  requestId: string,
  answerText: string,
): Promise<typeof questionRequests.$inferSelect | null> {
  const [row] = await db
    .update(questionRequests)
    .set({
      status: "answered",
      answerText,
      answeredAt: new Date(),
    })
    .where(and(eq(questionRequests.requestId, requestId), eq(questionRequests.status, "pending")))
    .returning();

  return row ?? null;
}

export async function expireQuestionByRequestId(
  db: Db,
  requestId: string,
): Promise<typeof questionRequests.$inferSelect | null> {
  const [row] = await db
    .update(questionRequests)
    .set({
      status: "expired",
      answeredAt: new Date(),
    })
    .where(and(eq(questionRequests.requestId, requestId), eq(questionRequests.status, "pending")))
    .returning();

  return row ?? null;
}

export async function getQuestionByRequestId(db: Db, requestId: string) {
  const rows = await db
    .select()
    .from(questionRequests)
    .where(eq(questionRequests.requestId, requestId))
    .limit(1);
  return rows[0];
}
