import { getThreadById, listThreadMessages } from "@tags/core/threads";
import { searchMemories } from "@tags/core/memory";
import type { Db } from "@tags/db";
import type { ModelMessage } from "ai";

type ThreadSummary = {
  text?: string;
  updatedAt?: string;
};

/** Rough char budget (~6k tokens) for thread history before model-specific limits. */
const MAX_HISTORY_CHARS = 24_000;

function messageChars(message: ModelMessage): number {
  return typeof message.content === "string" ? message.content.length : 0;
}

function totalChars(messages: ModelMessage[]): number {
  return messages.reduce((sum, message) => sum + messageChars(message), 0);
}

/** Keep chronological order; drop oldest turns when over budget. */
export function packThreadHistory(history: ModelMessage[]): ModelMessage[] {
  if (totalChars(history) <= MAX_HISTORY_CHARS) return history;

  const packed: ModelMessage[] = [];
  let chars = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i]!;
    const len = messageChars(message);
    if (chars + len > MAX_HISTORY_CHARS && packed.length > 0) break;
    packed.unshift(message);
    chars += len;
  }

  if (packed.length < history.length) {
    packed.unshift({
      role: "user",
      content: "[Earlier thread messages omitted to fit context budget.]",
    });
  }

  return packed;
}

export async function buildThreadContext(
  db: Db,
  threadId: string,
  spaceId: string,
  triggerText: string,
): Promise<ModelMessage[]> {
  const thread = await getThreadById(db, threadId);
  const stored = await listThreadMessages(
    db,
    threadId,
    thread ? { organizationId: thread.organizationId, spaceId: thread.spaceId } : undefined,
  );

  const history: ModelMessage[] = stored.map((m) => ({
    role: m.authorType === "human" ? "user" : "assistant",
    content: m.text,
  }));

  if (!history.some((m) => m.role === "user" && m.content === triggerText)) {
    history.push({ role: "user", content: triggerText });
  }

  const preamble: string[] = [];

  const summary = thread?.summary as ThreadSummary | null | undefined;
  if (summary?.text?.trim()) {
    preamble.push(`Thread summary:\n${summary.text.trim()}`);
  }

  const memories = await searchMemories(
    db,
    spaceId,
    triggerText,
    10,
    thread?.organizationId,
  );
  if (memories.length > 0) {
    const memoryBlock = memories
      .map((m) => `- [${m.kind}] ${m.content}`)
      .join("\n");
    preamble.push(`Relevant Space memory (matched to trigger):\n${memoryBlock}`);
  }

  const packed = packThreadHistory(history);

  if (preamble.length > 0) {
    packed.unshift({
      role: "user",
      content: preamble.join("\n\n"),
    });
  }

  return packed;
}

export function parseRememberCommand(text: string): string | null {
  const match = text.match(/remember\s+that\s+(.+)/i);
  return match?.[1]?.trim() ?? null;
}
