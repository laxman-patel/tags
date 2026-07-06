import { createFireworks } from "@ai-sdk/fireworks";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { TAGS_MODEL_ID } from "@tags/core/model-labels";
import {
  addMemoryEntry,
  MemoryFullError,
  mutateSpaceMemoryFile,
  replaceMemoryEntryBySubstring,
} from "@tags/core/file-memory";
import type { R2Storage } from "@tags/storage";
import { getMemoryPolicyForSpace } from "@tags/core/policies";
import { recordAuditEvent } from "@tags/core/audit";
import {
  countThreadMessages,
  listThreadMessages,
  updateThreadSummary,
} from "@tags/core/threads";
import type { Db } from "@tags/db";

const SUMMARY_THRESHOLD = 20;
const SUMMARY_MODEL = TAGS_MODEL_ID;

type MemoryConsolidationProposal = {
  oldText: string;
  content: string;
};

async function proposeMemoryConsolidation(args: {
  candidate: string;
  currentEntries: string[];
  charLimit: number;
  fireworksApiKey: string;
}): Promise<MemoryConsolidationProposal | null> {
  const fireworks = createFireworks({ apiKey: args.fireworksApiKey });
  const schema = z.object({
    replacement: z.union([
      z.object({
        oldText: z.string().min(1),
        content: z.string().min(1),
      }),
      z.null(),
    ]),
  });

  const result = await generateObject({
    model: fireworks(SUMMARY_MODEL),
    schema,
    prompt: `A Space MEMORY.md file is full. Propose at most one explicit replacement that saves the new candidate by merging it with exactly one overlapping existing entry.

Rules:
- Return replacement: null if no single existing entry overlaps enough to merge safely.
- oldText must be a unique substring of one current entry.
- content must be a compact standalone replacement that includes the durable meaning of both the old entry and the new candidate.
- Do not add unrelated facts or credentials.
- Keep content shorter than the old entry plus candidate combined.
- The file body limit is ${args.charLimit} characters.

Current entries:
${args.currentEntries.map((entry) => `- ${entry}`).join("\n")}

New candidate:
${args.candidate}`,
  });

  return result.object.replacement;
}

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
    storage?: R2Storage;
  },
): Promise<void> {
  if (!args.storage) return;

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
  const schema = z.object({
    memories: z
      .array(
        z.object({
          content: z.string().min(1),
        }),
      )
      .max(5),
  });

  let items: Array<{ content: string }> = [];
  try {
    const result = await generateObject({
      model: fireworks(SUMMARY_MODEL),
      schema,
      prompt: `Extract durable Space memory entries from this Slack thread.

Save only compact, standalone notes that will help this same Slack channel in future work:
- durable facts about the Space
- team preferences
- decisions
- corrections
- conventions
- workflow lessons

Skip trivial observations, one-off task state, raw logs, secrets, large snippets, and facts that can be easily rediscovered from files or the web.
Return at most 5 entries. Each entry should be a concise sentence suitable for MEMORY.md.

Transcript:
${transcript}`,
    });
    items = result.object.memories;
  } catch (error) {
    await recordAuditEvent(db, {
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      actorType: "agent",
      eventType: "memory.extraction_failed",
      payload: { error: error instanceof Error ? error.message : "Unknown extraction error" },
    });
    return;
  }

  for (const item of items) {
    try {
      await mutateSpaceMemoryFile(
        args.storage,
        {
          db,
          organizationId: args.organizationId,
          spaceId: args.spaceId,
          actorType: "agent",
          sourceThreadId: args.threadId,
        },
        (memory) => addMemoryEntry(memory, item.content),
      );
    } catch (error) {
      if (error instanceof MemoryFullError) {
        let replacement: MemoryConsolidationProposal | null = null;
        try {
          replacement = await proposeMemoryConsolidation({
            candidate: item.content,
            currentEntries: error.entries.map((entry) => entry.content),
            charLimit: error.usage.limit,
            fireworksApiKey: args.fireworksApiKey,
          });
        } catch (consolidationError) {
          await recordAuditEvent(db, {
            organizationId: args.organizationId,
            spaceId: args.spaceId,
            actorType: "agent",
            eventType: "memory.consolidation_failed",
            payload: {
              content: item.content,
              error:
                consolidationError instanceof Error
                  ? consolidationError.message
                  : "Unknown consolidation error",
            },
          });
          continue;
        }

        if (!replacement) {
          await recordAuditEvent(db, {
            organizationId: args.organizationId,
            spaceId: args.spaceId,
            actorType: "agent",
            eventType: "memory.full_skipped",
            payload: {
              content: item.content,
              usage: error.usage,
            },
          });
          continue;
        }

        const proposal = replacement;
        try {
          await mutateSpaceMemoryFile(
            args.storage,
            {
              db,
              organizationId: args.organizationId,
              spaceId: args.spaceId,
              actorType: "agent",
              sourceThreadId: args.threadId,
            },
            (memory) =>
              replaceMemoryEntryBySubstring(memory, proposal.oldText, proposal.content),
          );
        } catch (consolidationError) {
          await recordAuditEvent(db, {
            organizationId: args.organizationId,
            spaceId: args.spaceId,
            actorType: "agent",
            eventType: "memory.consolidation_failed",
            payload: {
              content: item.content,
              replacement,
              error:
                consolidationError instanceof Error
                  ? consolidationError.message
                  : "Unknown consolidation error",
            },
          });
        }
        continue;
      }
      await recordAuditEvent(db, {
        organizationId: args.organizationId,
        spaceId: args.spaceId,
        actorType: "agent",
        eventType: "memory.extraction_skipped",
        payload: {
          content: item.content,
          error: error instanceof Error ? error.message : "Unknown memory write error",
        },
      });
    }
  }
}
