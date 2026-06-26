import { resolveSpaceByChannel } from "@tags/core/spaces";
import { approvalHook, tagsRunWorkflow } from "@tags/runtime";
import { start } from "workflow/api";
import { getEnv } from "@/env";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type SlackEventPayload = {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    user?: string;
    text?: string;
    channel: string;
    channel_type?: string;
    ts: string;
    thread_ts?: string;
    event_ts?: string;
  };
  event_id?: string;
  team_id?: string;
};

export async function POST(request: Request) {
  const env = getEnv();
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  const { verifySlackSignature } = await import("@tags/slack");
  if (!verifySlackSignature(env.SLACK_SIGNING_SECRET, rawBody, timestamp, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as SlackEventPayload;

  if (payload.type === "url_verification" && payload.challenge) {
    return Response.json({ challenge: payload.challenge });
  }

  const event = payload.event;
  if (!event || event.type !== "app_mention") {
    return new Response("ok");
  }

  const teamId = payload.team_id ?? "";
  const channelId = event.channel;
  const text = event.text?.replace(/<@[^>]+>/g, "").trim() ?? "";
  const threadTs = event.thread_ts ?? event.ts;
  const rootTs = event.thread_ts ?? event.ts;
  const eventId = payload.event_id ?? event.event_ts ?? event.ts;

  const db = getDb();
  const resolved = await resolveSpaceByChannel(db, teamId, channelId);
  if (!resolved) {
    console.warn(`No space mapped for team=${teamId} channel=${channelId}`);
    return new Response("ok");
  }

  const idempotencyKey = `slack:${teamId}:${channelId}:${eventId}`;

  await start(tagsRunWorkflow, [
    {
      databaseUrl: env.DATABASE_URL,
      gatewayApiKey: env.AI_GATEWAY_API_KEY,
      slackBotToken: env.SLACK_BOT_TOKEN,
      organizationId: resolved.space.organizationId,
      spaceId: resolved.space.id,
      spaceName: resolved.space.name,
      channelId,
      teamId,
      threadTs,
      rootMessageTs: rootTs,
      triggerText: text || "Hello Tags",
      triggerMessageTs: event.ts,
      actorSlackUserId: event.user ?? "unknown",
      idempotencyKey,
      appUrl: env.NEXT_PUBLIC_APP_URL,
    },
  ]);

  return new Response("ok");
}
