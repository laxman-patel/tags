import { getThreadById, listThreadMessages } from "@tags/core/threads";
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
  organizationId: string,
  spaceId: string,
  triggerText: string,
): Promise<ModelMessage[]> {
  const scope = { organizationId, spaceId };
  const thread = await getThreadById(db, threadId, scope);
  const stored = await listThreadMessages(db, threadId, scope);

  const history: ModelMessage[] = stored.map((m) => ({
    role: m.authorType === "human" ? "user" : "assistant",
    content: m.text,
  }));

  // Stored trigger may carry inlined file attachments appended to the text,
  // so match by prefix rather than strict equality.
  const hasTrigger = history.some(
    (m) =>
      m.role === "user" &&
      typeof m.content === "string" &&
      m.content.startsWith(triggerText),
  );
  if (!hasTrigger) {
    history.push({ role: "user", content: triggerText });
  }

  const preamble: string[] = [];

  const summary = thread?.summary as ThreadSummary | null | undefined;
  if (summary?.text?.trim()) {
    preamble.push(`Thread summary:\n${summary.text.trim()}`);
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

export type MemoryCommand =
  | { action: "add"; content: string }
  | { action: "remove"; oldText: string }
  | { action: "show" };

export function parseMemoryCommand(text: string): MemoryCommand | null {
  const withoutMention = text.replace(/<@[^>]+>/g, "").replace(/@tags/gi, "").trim();
  const remember = withoutMention.match(/^remember\s+that\s+(.+)/i);
  if (remember?.[1]?.trim()) {
    return { action: "add", content: remember[1].trim() };
  }

  const forget = withoutMention.match(/^forget\s+(.+)/i);
  if (forget?.[1]?.trim()) {
    return { action: "remove", oldText: forget[1].trim() };
  }

  if (/^(show\s+memory|what\s+do\s+you\s+remember\b.*)/i.test(withoutMention)) {
    return { action: "show" };
  }

  return null;
}
