import { cron } from "inngest";
import type { InngestFunction } from "inngest";
import { and, eq } from "drizzle-orm";
import { createFireworks } from "@ai-sdk/fireworks";
import { generateObject } from "ai";
import { z } from "zod";
import {
  addMemoryEntry,
  MemoryFullError,
  mutateSpaceMemoryFile,
} from "@tags/core/file-memory";
import { getMemoryPolicyForSpace } from "@tags/core/policies";
import { recordAuditEvent } from "@tags/core/audit";
import { listThreadMessages } from "@tags/core/threads";
import { createDb, spaceConfigs, spaces, threads } from "@tags/db";
import { createR2Client, type R2Storage } from "@tags/storage";
import { inngest } from "./client";
import { loadRuntimeSecrets } from "../secrets";

const PASSIVE_MODEL = "accounts/fireworks/routers/glm-5p2-fast";

async function findPassiveLearningSpaces(db: ReturnType<typeof createDb>) {
  const rows = await db
    .select({
      spaceId: spaceConfigs.spaceId,
      organizationId: spaceConfigs.organizationId,
      passiveLearningMode: spaceConfigs.passiveLearningMode,
    })
    .from(spaceConfigs)
    .where(
      and(
        eq(spaceConfigs.isActive, true),
        eq(spaceConfigs.passiveLearningMode, "extract_memory"),
      ),
    );
  return rows;
}

async function findChannelLogThread(
  db: ReturnType<typeof createDb>,
  spaceId: string,
  channelId: string,
) {
  const providerThreadId = `channel-log:${channelId}`;
  const rows = await db
    .select()
    .from(threads)
    .where(and(eq(threads.spaceId, spaceId), eq(threads.providerThreadId, providerThreadId)))
    .limit(1);
  return rows[0] ?? null;
}

async function findSpaceChannelId(
  db: ReturnType<typeof createDb>,
  spaceId: string,
): Promise<string | null> {
  const rows = await db
    .select({ externalSpaceId: spaces.externalSpaceId })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);
  return rows[0]?.externalSpaceId ?? null;
}

async function extractPassiveMemories(
  db: ReturnType<typeof createDb>,
  args: {
    spaceId: string;
    organizationId: string;
    threadId: string;
    fireworksApiKey: string;
    storage: R2Storage;
  },
): Promise<{ extracted: number; skipped: number }> {
  const policy = await getMemoryPolicyForSpace(db, args.spaceId);
  if (policy && !policy.allowAgentProposed) {
    return { extracted: 0, skipped: 0 };
  }

  const allMessages = await listThreadMessages(db, args.threadId, {
    organizationId: args.organizationId,
    spaceId: args.spaceId,
  });

  const passiveMessages = allMessages.filter(
    (m) => (m.metadata as Record<string, unknown> | null)?.passive === true,
  );

  if (passiveMessages.length < 2) {
    return { extracted: 0, skipped: 0 };
  }

  const transcript = passiveMessages
    .map((m) => `${m.authorId}: ${m.text}`)
    .join("\n")
    .slice(0, 8000);

  const fireworks = createFireworks({ apiKey: args.fireworksApiKey });
  const schema = z.object({
    memories: z.array(z.object({ content: z.string().min(1) })).max(3),
  });

  let items: Array<{ content: string }> = [];
  try {
    const result = await generateObject({
      model: fireworks(PASSIVE_MODEL),
      schema,
      prompt: `Extract durable Space memory entries from this Slack channel conversation.
These are ambient channel messages (not directed at Tags). Extract only durable, reusable facts.

Save only compact, standalone notes that will help this Slack channel in future work:
- durable facts about the team or project
- team preferences and conventions
- decisions and corrections
- workflow lessons

Skip trivial observations, one-off chatter, raw logs, secrets, large snippets, and
facts that can be easily rediscovered from files or the web.
Return at most 3 entries. Each entry should be a concise sentence suitable for MEMORY.md.

Channel messages:
${transcript}`,
    });
    items = result.object.memories;
  } catch (error) {
    await recordAuditEvent(db, {
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      actorType: "agent",
      eventType: "passive_learning.extraction_failed",
      payload: {
        error: error instanceof Error ? error.message : "Unknown extraction error",
        messageCount: passiveMessages.length,
      },
    });
    return { extracted: 0, skipped: passiveMessages.length };
  }

  let extracted = 0;
  let skipped = 0;

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
      extracted += 1;
    } catch (error) {
      if (error instanceof MemoryFullError) {
        await recordAuditEvent(db, {
          organizationId: args.organizationId,
          spaceId: args.spaceId,
          actorType: "agent",
          eventType: "passive_learning.memory_full",
          payload: { content: item.content },
        });
      } else {
        await recordAuditEvent(db, {
          organizationId: args.organizationId,
          spaceId: args.spaceId,
          actorType: "agent",
          eventType: "passive_learning.extraction_skipped",
          payload: {
            content: item.content,
            error: error instanceof Error ? error.message : "Unknown memory write error",
          },
        });
      }
      skipped += 1;
    }
  }

  await recordAuditEvent(db, {
    organizationId: args.organizationId,
    spaceId: args.spaceId,
    actorType: "agent",
    eventType: "passive_learning.extracted",
    payload: { extracted, skipped, messageCount: passiveMessages.length },
  });

  return { extracted, skipped };
}

export type PassiveLearningTickResult = {
  processed: number;
  extracted: number;
  skipped: number;
};

export async function runPassiveLearningTick(): Promise<PassiveLearningTickResult> {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);

  if (!secrets.r2 || !secrets.fireworksApiKey) {
    return { processed: 0, extracted: 0, skipped: 0 };
  }

  const storage: R2Storage = {
    client: createR2Client(secrets.r2),
    config: secrets.r2,
  };

  const spacesWithLearning = await findPassiveLearningSpaces(db);

  let totalExtracted = 0;
  let totalSkipped = 0;
  let processed = 0;

  for (const spaceConfig of spacesWithLearning) {
    const channelId = await findSpaceChannelId(db, spaceConfig.spaceId);
    if (!channelId) continue;

    const thread = await findChannelLogThread(db, spaceConfig.spaceId, channelId);
    if (!thread) continue;

    try {
      const result = await extractPassiveMemories(db, {
        spaceId: spaceConfig.spaceId,
        organizationId: spaceConfig.organizationId,
        threadId: thread.id,
        fireworksApiKey: secrets.fireworksApiKey,
        storage,
      });
      totalExtracted += result.extracted;
      totalSkipped += result.skipped;
      processed += 1;
    } catch (error) {
      await recordAuditEvent(db, {
        organizationId: spaceConfig.organizationId,
        spaceId: spaceConfig.spaceId,
        actorType: "agent",
        eventType: "passive_learning.tick_error",
        payload: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  return { processed, extracted: totalExtracted, skipped: totalSkipped };
}

export const passiveLearningTickFunction: InngestFunction.Any = inngest.createFunction(
  { id: "passive-learning-tick", triggers: [cron("*/30 * * * *")] },
  async ({ step }) => {
    return step.run("extract-passive-memories", () => runPassiveLearningTick());
  },
);
