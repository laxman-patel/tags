import { listThreadMessages } from "@tags/core/threads";
import type { Db } from "@tags/db";
import type { CoreMessage } from "ai";

export async function buildThreadContext(
  db: Db,
  threadId: string,
  triggerText: string,
): Promise<CoreMessage[]> {
  const stored = await listThreadMessages(db, threadId);

  const history: CoreMessage[] = stored.map((m) => ({
    role: m.authorType === "human" ? "user" : "assistant",
    content: m.text,
  }));

  if (!history.some((m) => m.role === "user" && m.content === triggerText)) {
    history.push({ role: "user", content: triggerText });
  }

  return history;
}
