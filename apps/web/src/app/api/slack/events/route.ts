import { getEnv } from "@/env";
import { startRunFromSlack } from "@/lib/slack-run";

export const runtime = "nodejs";

type SlackEventPayload = {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    subtype?: string;
    user?: string;
    text?: string;
    channel: string;
    channel_type?: string;
    ts: string;
    thread_ts?: string;
    event_ts?: string;
    bot_id?: string;
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
  if (!event) return new Response("ok");

  if (event.bot_id) {
    return new Response("ok");
  }

  const teamId = payload.team_id ?? "";
  const channelId = event.channel;
  const text = event.text?.replace(/<@[^>]+>/g, "").trim() ?? "";
  const threadTs = event.thread_ts ?? event.ts;
  const rootTs = event.thread_ts ?? event.ts;
  const eventId = payload.event_id ?? event.event_ts ?? event.ts;

  if (event.subtype && event.subtype !== "thread_broadcast") {
    return new Response("ok");
  }

  const isMention = event.type === "app_mention";
  const isThreadReply =
    event.type === "message" &&
    event.thread_ts &&
    (text.toLowerCase().includes("@tags") || text.toLowerCase().startsWith("tags "));

  if (!isMention && !isThreadReply) {
    return new Response("ok");
  }

  await startRunFromSlack(env, {
    teamId,
    channelId,
    threadTs,
    rootTs,
    text: text || "Hello Tags",
    messageTs: event.ts,
    actorSlackUserId: event.user ?? "unknown",
    eventId,
    trigger: isMention ? "mention" : "reply",
  });

  return new Response("ok");
}
