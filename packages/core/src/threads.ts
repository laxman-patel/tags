import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { messages, newId, threads } from "@tags/db";

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
    .returning();

  if (!row) throw new Error("Failed to create thread");
  return row;
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

export async function listThreadMessages(
  db: Db,
  threadId: string,
): Promise<Array<typeof messages.$inferSelect>> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.createdAt));
}
