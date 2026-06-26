import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@tags/db";
import { memories, newId } from "@tags/db";

export async function searchMemories(db: Db, spaceId: string, query: string, limit = 20) {
  if (!query.trim()) {
    return db
      .select()
      .from(memories)
      .where(and(eq(memories.spaceId, spaceId), isNull(memories.deletedAt)))
      .orderBy(desc(memories.createdAt))
      .limit(limit);
  }

  return db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.spaceId, spaceId),
        isNull(memories.deletedAt),
        sql`(
          ${memories.searchTsv} @@ plainto_tsquery('english', ${query})
          OR ${memories.searchText} % ${query}
        )`,
      ),
    )
    .orderBy(desc(memories.createdAt))
    .limit(limit);
}

export async function saveMemory(
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    kind: "fact" | "summary" | "preference" | "decision" | "artifact";
    content: string;
    createdBy: "human" | "agent" | "system";
    sourceThreadId?: string;
    confidence?: number;
  },
) {
  const id = newId();
  const normalized = args.content.trim().toLowerCase();
  const [row] = await db
    .insert(memories)
    .values({
      id,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      kind: args.kind,
      content: args.content,
      searchText: normalized,
      createdBy: args.createdBy,
      sourceThreadId: args.sourceThreadId,
      confidence: args.confidence ?? 70,
    })
    .returning();
  return row;
}

export async function softDeleteMemory(db: Db, memoryId: string) {
  await db
    .update(memories)
    .set({ deletedAt: new Date() })
    .where(eq(memories.id, memoryId));
}

export async function listMemoriesForSpace(db: Db, spaceId: string) {
  return db
    .select()
    .from(memories)
    .where(and(eq(memories.spaceId, spaceId), isNull(memories.deletedAt)))
    .orderBy(desc(memories.createdAt));
}
