import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@tags/db";
import { messages, threads, withDbRlsScope } from "@tags/db";

type RoleFilter = "human" | "agent" | "system";

export type SessionSearchArgs = {
  organizationId: string;
  spaceId: string;
  query?: string;
  limit?: number;
  sort?: "relevance" | "newest" | "oldest";
  roleFilter?: RoleFilter[];
  threadId?: string;
  aroundMessageId?: string;
  window?: number;
};

export type SessionSearchMessage = {
  id: string;
  threadId: string;
  authorType: string;
  authorId: string;
  text: string;
  createdAt: Date;
};

export type SessionSearchResult = {
  threadId: string;
  title: string | null;
  rootMessageId: string;
  snippet?: string;
  matchMessageId?: string;
  messagesBefore?: number;
  messagesAfter?: number;
  bookendStart: SessionSearchMessage[];
  messages: SessionSearchMessage[];
  bookendEnd: SessionSearchMessage[];
};

function normalizeRoles(roleFilter?: RoleFilter[]): RoleFilter[] {
  return roleFilter && roleFilter.length > 0 ? roleFilter : ["human", "agent"];
}

function rowToMessage(row: typeof messages.$inferSelect): SessionSearchMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    authorType: row.authorType,
    authorId: row.authorId,
    text: row.text,
    createdAt: row.createdAt,
  };
}

function snippet(text: string, query?: string): string {
  if (!query?.trim()) return text.slice(0, 240);
  const lower = text.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const index = terms.reduce((best, term) => {
    const found = lower.indexOf(term);
    if (found < 0) return best;
    return best < 0 ? found : Math.min(best, found);
  }, -1);
  if (index < 0) return text.slice(0, 240);
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 160);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

async function windowForThread(
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    threadId: string;
    matchMessageId?: string;
    roles: RoleFilter[];
    window: number;
  },
): Promise<{
  bookendStart: SessionSearchMessage[];
  messages: SessionSearchMessage[];
  bookendEnd: SessionSearchMessage[];
  messagesBefore: number;
  messagesAfter: number;
}> {
  const rows = await withDbRlsScope(
    db,
    { organizationId: args.organizationId, spaceId: args.spaceId },
    (scopedDb) =>
      scopedDb
        .select()
        .from(messages)
        .where(and(eq(messages.threadId, args.threadId), inArray(messages.authorType, args.roles)))
        .orderBy(asc(messages.createdAt)),
  );

  const mapped = rows.map(rowToMessage);
  const anchorIndex = args.matchMessageId
    ? Math.max(0, mapped.findIndex((message) => message.id === args.matchMessageId))
    : Math.max(0, mapped.length - 1);
  const resolvedIndex = anchorIndex < 0 ? 0 : anchorIndex;
  const start = Math.max(0, resolvedIndex - args.window);
  const end = Math.min(mapped.length, resolvedIndex + args.window + 1);

  return {
    bookendStart: mapped.slice(0, 3),
    messages: mapped.slice(start, end),
    bookendEnd: mapped.slice(-3),
    messagesBefore: start,
    messagesAfter: Math.max(0, mapped.length - end),
  };
}

export async function searchSpaceSessions(
  db: Db,
  args: SessionSearchArgs,
): Promise<SessionSearchResult[]> {
  const roles = normalizeRoles(args.roleFilter);
  const limit = Math.min(Math.max(args.limit ?? 3, 1), 10);
  const window = Math.min(Math.max(args.window ?? 5, 1), 20);

  if (args.threadId && args.aroundMessageId) {
    const threadRows = await db
      .select()
      .from(threads)
      .where(
        and(
          eq(threads.organizationId, args.organizationId),
          eq(threads.spaceId, args.spaceId),
          eq(threads.id, args.threadId),
        ),
      )
      .limit(1);
    const thread = threadRows[0];
    if (!thread) return [];
    const threadWindow = await windowForThread(db, {
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      threadId: args.threadId,
      matchMessageId: args.aroundMessageId,
      roles,
      window,
    });
    return [
      {
        threadId: thread.id,
        title: thread.title,
        rootMessageId: thread.rootMessageId,
        matchMessageId: args.aroundMessageId,
        ...threadWindow,
      },
    ];
  }

  if (!args.query?.trim()) {
    const recentThreads = await db
      .select()
      .from(threads)
      .where(and(eq(threads.organizationId, args.organizationId), eq(threads.spaceId, args.spaceId)))
      .orderBy(desc(threads.updatedAt))
      .limit(limit);

    const results: SessionSearchResult[] = [];
    for (const thread of recentThreads) {
      const threadWindow = await windowForThread(db, {
        organizationId: args.organizationId,
        spaceId: args.spaceId,
        threadId: thread.id,
        roles,
        window,
      });
      results.push({
        threadId: thread.id,
        title: thread.title,
        rootMessageId: thread.rootMessageId,
        ...threadWindow,
      });
    }
    return results;
  }

  const query = args.query.trim();
  const order =
    args.sort === "newest"
      ? desc(messages.createdAt)
      : args.sort === "oldest"
        ? asc(messages.createdAt)
        : sql`ts_rank(messages.search_tsv, websearch_to_tsquery('english', ${query})) desc`;

  const hits = await db
    .select({
      message: messages,
      thread: threads,
    })
    .from(messages)
    .innerJoin(threads, eq(messages.threadId, threads.id))
    .where(
      and(
        eq(messages.organizationId, args.organizationId),
        eq(messages.spaceId, args.spaceId),
        inArray(messages.authorType, roles),
        sql`messages.search_tsv @@ websearch_to_tsquery('english', ${query})`,
      ),
    )
    .orderBy(order)
    .limit(limit * 3);

  const seen = new Set<string>();
  const results: SessionSearchResult[] = [];
  for (const hit of hits) {
    if (seen.has(hit.thread.id)) continue;
    seen.add(hit.thread.id);
    const threadWindow = await windowForThread(db, {
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      threadId: hit.thread.id,
      matchMessageId: hit.message.id,
      roles,
      window,
    });
    results.push({
      threadId: hit.thread.id,
      title: hit.thread.title,
      rootMessageId: hit.thread.rootMessageId,
      snippet: snippet(hit.message.text, query),
      matchMessageId: hit.message.id,
      ...threadWindow,
    });
    if (results.length >= limit) break;
  }

  return results;
}
