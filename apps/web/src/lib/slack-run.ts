import { resolveSpaceByChannel } from "@tags/core/spaces";
import { tagsRunWorkflow } from "@tags/runtime";
import { start } from "workflow/api";
import type { Env } from "@/env";
import { getWorkflowEnvExtras } from "@/env";
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
  trigger: "mention" | "reply";
};

export async function startRunFromSlack(env: Env, trigger: SlackTrigger) {
  const db = getDb();
  const resolved = await resolveSpaceByChannel(db, trigger.teamId, trigger.channelId);
  if (!resolved) return { ok: false as const, reason: "no_space" };

  const idempotencyKey = `slack:${trigger.teamId}:${trigger.channelId}:${trigger.eventId}`;
  const extras = getWorkflowEnvExtras(env);

  await start(tagsRunWorkflow, [
    {
      databaseUrl: env.DATABASE_URL,
      gatewayApiKey: env.AI_GATEWAY_API_KEY,
      slackBotToken: env.SLACK_BOT_TOKEN,
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
      ...extras,
    },
  ]);

  return { ok: true as const };
}
