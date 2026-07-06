import { and, asc, count, eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { messages, newId, threads, withDbRlsScope, type RlsScope } from "@tags/db";

export async function findOrCreateThread(
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    providerThreadId: string;
    rootMessageId: string;
    createdByUserId?: string;
  },
): Promise<typeof threads.$inferSelect> {
  const existing = await db
    .select()
    .from(threads)
    .where(
      and(
        eq(threads.spaceId, args.spaceId),
        eq(threads.providerThreadId, args.providerThreadId),
      ),
    )
    .limit(1);

  if (existing[0]) return existing[0];

  const id = newId();
  // Concurrent Slack events for the same thread can race past the select above;
  // on conflict, defer to the row the other insert created.
  const [row] = await db
    .insert(threads)
    .values({
      id,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      providerThreadId: args.providerThreadId,
      rootMessageId: args.rootMessageId,
      createdByUserId: args.createdByUserId,
      status: "open",
    })
    .onConflictDoNothing({
      target: [threads.spaceId, threads.providerThreadId],
    })
    .returning();

  if (row) return row;

  const winner = await db
    .select()
    .from(threads)
    .where(
      and(
        eq(threads.spaceId, args.spaceId),
        eq(threads.providerThreadId, args.providerThreadId),
      ),
    )
    .limit(1);

  if (!winner[0]) throw new Error("Failed to create thread");
  return winner[0];
}

export async function upsertMessage(
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    threadId: string;
    providerMessageId: string;
    authorType: "human" | "agent" | "system";
    authorId: string;
    text: string;
    uiMessageJson?: unknown;
    metadata?: unknown;
  },
): Promise<typeof messages.$inferSelect | null> {
  const existing = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.threadId, args.threadId),
        eq(messages.providerMessageId, args.providerMessageId),
      ),
    )
    .limit(1);

  if (existing[0]) return null;

  const id = newId();
  const [row] = await db
    .insert(messages)
    .values({
      id,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      threadId: args.threadId,
      providerMessageId: args.providerMessageId,
      authorType: args.authorType,
      authorId: args.authorId,
      text: args.text,
      uiMessageJson: args.uiMessageJson,
      metadata: args.metadata,
    })
    .returning();

  return row ?? null;
}

export async function getThreadById(
  db: Db,
  threadId: string,
  scope?: Pick<RlsScope, "organizationId" | "spaceId">,
) {
  const runQuery = async (scopedDb: Db) => {
    const conditions = [eq(threads.id, threadId)];
    if (scope) {
      conditions.push(eq(threads.organizationId, scope.organizationId));
      conditions.push(eq(threads.spaceId, scope.spaceId));
    }

    const rows = await scopedDb
      .select()
      .from(threads)
      .where(and(...conditions))
      .limit(1);
    return rows[0];
  };

  if (scope) {
    return withDbRlsScope(db, scope, runQuery);
  }

  return runQuery(db);
}

export async function countThreadMessages(db: Db, threadId: string): Promise<number> {
  const rows = await db
    .select({ total: count() })
    .from(messages)
    .where(eq(messages.threadId, threadId));
  return Number(rows[0]?.total ?? 0);
}

export async function updateThreadSummary(
  db: Db,
  threadId: string,
  summary: { text: string; updatedAt: string },
): Promise<void> {
  await db
    .update(threads)
    .set({ summary, updatedAt: new Date() })
    .where(eq(threads.id, threadId));
}

export async function listThreadMessages(
  db: Db,
  threadId: string,
  scope?: { organizationId: string; spaceId: string },
): Promise<Array<typeof messages.$inferSelect>> {
  const runQuery = async (scopedDb: Db) =>
    scopedDb
      .select()
      .from(messages)
      .where(eq(messages.threadId, threadId))
      .orderBy(asc(messages.createdAt));

  if (scope) {
    return withDbRlsScope(
      db,
      { organizationId: scope.organizationId, spaceId: scope.spaceId },
      runQuery,
    );
  }

  return runQuery(db);
}

export async function getMessageByProviderMessageId(
  db: Db,
  threadId: string,
  providerMessageId: string,
): Promise<typeof messages.$inferSelect | null> {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.threadId, threadId),
        eq(messages.providerMessageId, providerMessageId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
