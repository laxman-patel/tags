import { resolveSpaceByChannel } from "@tags/core/spaces";
import { inngest, RUN_REQUESTED_EVENT, type TagsRunInput } from "@tags/runtime";
import type { Env } from "@/env";
import { getDb } from "@/lib/db";

export type SlackTrigger = {
  teamId: string;
  channelId: string;
  threadTs: string;
  rootTs: string;
  text: string;
  messageTs: string;
  actorSlackUserId: string;
  eventId: string;
  trigger: "mention" | "reply" | "schedule";
  placeholderMessageTs?: string;
};

export async function startRunFromSlack(env: Env, trigger: SlackTrigger) {
  const db = getDb();
  const resolved = await resolveSpaceByChannel(db, trigger.teamId, trigger.channelId);
  if (!resolved) return { ok: false as const, reason: "no_space" };

  const idempotencyKey = `slack:${trigger.teamId}:${trigger.channelId}:${trigger.eventId}`;

  const data: TagsRunInput = {
    organizationId: resolved.space.organizationId,
    workspaceId: resolved.workspace.id,
    spaceId: resolved.space.id,
    spaceName: resolved.space.name,
    channelId: trigger.channelId,
    teamId: trigger.teamId,
    threadTs: trigger.threadTs,
    rootMessageTs: trigger.rootTs,
    triggerText: trigger.text || "Hello Tags",
    triggerMessageTs: trigger.messageTs,
    actorSlackUserId: trigger.actorSlackUserId,
    idempotencyKey,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    trigger: trigger.trigger,
    placeholderMessageTs: trigger.placeholderMessageTs,
  };

  await inngest.send({ name: RUN_REQUESTED_EVENT, data });

  return { ok: true as const };
}
