import { listThreadMessages } from "@tags/core/threads";
import { searchMemories } from "@tags/core/memory";
import type { Db } from "@tags/db";
import type { CoreMessage } from "ai";

export async function buildThreadContext(
  db: Db,
  threadId: string,
  spaceId: string,
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

  const memories = await searchMemories(db, spaceId, "");
  if (memories.length > 0) {
    const memoryBlock = memories
      .slice(0, 15)
      .map((m) => `- [${m.kind}] ${m.content}`)
      .join("\n");
    history.unshift({
      role: "user",
      content: `Relevant Space memory:\n${memoryBlock}`,
    });
  }

  return history;
}

export function parseRememberCommand(text: string): string | null {
  const match = text.match(/remember\s+that\s+(.+)/i);
  return match?.[1]?.trim() ?? null;
}
