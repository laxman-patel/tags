import { createFireworks } from "@ai-sdk/fireworks";
import { generateText } from "ai";
import { getMemoryPolicyForSpace } from "@tags/core/policies";
import { saveMemory } from "@tags/core/memory";
import {
  countThreadMessages,
  listThreadMessages,
  updateThreadSummary,
} from "@tags/core/threads";
import type { Db } from "@tags/db";

const SUMMARY_THRESHOLD = 20;
const SUMMARY_MODEL = "accounts/fireworks/routers/glm-5p2-fast";

export async function maybeSummarizeThread(
  db: Db,
  args: {
    threadId: string;
    organizationId: string;
    spaceId: string;
    fireworksApiKey: string;
  },
): Promise<void> {
  const messageCount = await countThreadMessages(db, args.threadId);
  if (messageCount <= SUMMARY_THRESHOLD) return;

  const messages = await listThreadMessages(db, args.threadId, {
    organizationId: args.organizationId,
    spaceId: args.spaceId,
  });

  const transcript = messages
    .map((m) => `${m.authorType}: ${m.text}`)
    .join("\n")
    .slice(0, 12_000);

  const fireworks = createFireworks({ apiKey: args.fireworksApiKey });
  const result = await generateText({
    model: fireworks(SUMMARY_MODEL),
    prompt: `Summarize this Slack thread for future agent context. Be concise (under 400 words). Capture decisions, open questions, and key facts.\n\n${transcript}`,
  });

  const text = result.text.trim();
  if (!text) return;

  await updateThreadSummary(db, args.threadId, {
    text,
    updatedAt: new Date().toISOString(),
  });
}

export async function maybeExtractMemories(
  db: Db,
  args: {
    threadId: string;
    organizationId: string;
    spaceId: string;
    fireworksApiKey: string;
  },
): Promise<void> {
  const policy = await getMemoryPolicyForSpace(db, args.spaceId);
  if (policy && !policy.allowAgentProposed) return;

  const messages = await listThreadMessages(db, args.threadId, {
    organizationId: args.organizationId,
    spaceId: args.spaceId,
  });

  if (messages.length < 2) return;

  const transcript = messages
    .map((m) => `${m.authorType}: ${m.text}`)
    .join("\n")
    .slice(0, 8000);

  const fireworks = createFireworks({ apiKey: args.fireworksApiKey });
  const result = await generateText({
    model: fireworks(SUMMARY_MODEL),
    prompt: `Extract durable facts, preferences, or decisions from this thread as JSON array. Each item: {"kind":"fact"|"preference"|"decision","content":"..."}. Return [] if nothing worth remembering. Max 5 items.\n\n${transcript}`,
  });

  let items: Array<{ kind: "fact" | "preference" | "decision"; content: string }> = [];
  try {
    const parsed = JSON.parse(result.text.trim()) as unknown;
    if (Array.isArray(parsed)) {
      items = parsed.filter(
        (item): item is { kind: "fact" | "preference" | "decision"; content: string } =>
          typeof item === "object" &&
          item !== null &&
          "content" in item &&
          typeof (item as { content: unknown }).content === "string",
      );
    }
  } catch {
    return;
  }

  for (const item of items.slice(0, 5)) {
    const kind = item.kind ?? "fact";
    if (kind !== "fact" && kind !== "preference" && kind !== "decision") continue;
    await saveMemory(db, {
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      kind,
      content: item.content.trim(),
      createdBy: "agent",
      sourceThreadId: args.threadId,
      confidence: 40,
    });
  }
}
