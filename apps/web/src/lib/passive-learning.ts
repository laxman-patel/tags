import { resolveSpaceByChannel, loadActiveSpaceConfig } from "@tags/core/spaces";
import { findOrCreateThread, upsertMessage } from "@tags/core/threads";
import { recordAuditEvent } from "@tags/core/audit";
import type { Env } from "@/env";
import { getDb } from "@/lib/db";

export type PassiveIngestArgs = {
  teamId: string;
  channelId: string;
  messageTs: string;
  text: string;
  actorSlackUserId: string;
};

export async function passivelyIngestChannelMessage(env: Env, args: PassiveIngestArgs): Promise<void> {
  const db = getDb();
  const resolved = await resolveSpaceByChannel(db, args.teamId, args.channelId);
  if (!resolved) return;

  const config = await loadActiveSpaceConfig(db, resolved.space.id);
  if (!config || config.passiveLearningMode === "off") return;

  const providerThreadId = `channel-log:${args.channelId}`;
  const thread = await findOrCreateThread(db, {
    organizationId: resolved.space.organizationId,
    spaceId: resolved.space.id,
    providerThreadId,
    rootMessageId: providerThreadId,
  });

  await upsertMessage(db, {
    organizationId: resolved.space.organizationId,
    spaceId: resolved.space.id,
    threadId: thread.id,
    providerMessageId: args.messageTs,
    authorType: "human",
    authorId: args.actorSlackUserId,
    text: args.text,
    metadata: {
      passive: true,
      channelId: args.channelId,
      slackTs: args.messageTs,
    },
  });

  await recordAuditEvent(db, {
    organizationId: resolved.space.organizationId,
    spaceId: resolved.space.id,
    actorType: "system",
    eventType: "passive_learning.ingested",
    payload: {
      channelId: args.channelId,
      messageTs: args.messageTs,
      threadId: thread.id,
    },
  });
}
