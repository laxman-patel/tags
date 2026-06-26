import type { WebClient } from "@slack/web-api";
import type { Db } from "@tags/db";
import { upsertMessage } from "@tags/core/threads";

export async function syncSlackThreadToDb(
  client: WebClient,
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    threadId: string;
    channelId: string;
    threadTs: string;
  },
): Promise<number> {
  const { fetchThreadReplies } = await import("./client");
  const messages = await fetchThreadReplies(client, args.channelId, args.threadTs);

  let synced = 0;
  for (const msg of messages) {
    if (!msg.ts || !msg.text) continue;
    const authorType = msg.bot_id ? "agent" : "human";
    const authorId = msg.user ?? msg.bot_id ?? "unknown";
    const row = await upsertMessage(db, {
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      threadId: args.threadId,
      providerMessageId: msg.ts,
      authorType,
      authorId,
      text: msg.text,
    });
    if (row) synced += 1;
  }
  return synced;
}
