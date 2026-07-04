import { getEnv } from "@/env";
import { startRunFromSlack } from "@/lib/slack-run";
import { passivelyIngestChannelMessage } from "@/lib/passive-learning";
import { addReaction, createSlackClient, postThreadMessage, startStream } from "@tags/slack";

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
  const rawText = event.text ?? "";
  const mentionsBot = env.SLACK_BOT_USER_ID
    ? rawText.includes(`<@${env.SLACK_BOT_USER_ID}>`)
    : /<@[^>]+>/.test(rawText);
  const text = rawText.replace(/<@[^>]+>/g, "").trim();
  const threadTs = event.thread_ts ?? event.ts;
  const rootTs = event.thread_ts ?? event.ts;
  const eventId = payload.event_id ?? event.event_ts ?? event.ts;

  // file_share is how Slack marks messages with uploads — those must still trigger.
  if (
    event.subtype &&
    event.subtype !== "thread_broadcast" &&
    event.subtype !== "file_share"
  ) {
    return new Response("ok");
  }

  const isMention = event.type === "app_mention";
  const isThreadReply =
    event.type === "message" &&
    Boolean(event.thread_ts) &&
    (mentionsBot || text.toLowerCase().startsWith("tags "));

  if (!isMention && !isThreadReply) {
    // Passive learning: ingest non-mention channel messages for configured Spaces.
    // Does not start a run or post anything to Slack.
    if (event.type === "message" && event.user) {
      passivelyIngestChannelMessage(env, {
        teamId,
        channelId,
        messageTs: event.ts,
        text: rawText,
        actorSlackUserId: event.user,
      }).catch(() => {});
    }
    return new Response("ok");
  }

  const slack = createSlackClient(env.SLACK_BOT_TOKEN);

  const ack = addReaction(slack, channelId, event.ts, "eyes").catch(() => {});

  // Open a native streaming message so Slack immediately shows the animated
  // "Tags is thinking…" indicator. Falls back to a plain placeholder message
  // (e.g. workspace/plan doesn't support streaming yet).
  let placeholderMessageTs: string | undefined;
  let placeholderIsStream = false;
  if (event.user) {
    try {
      const stream = await startStream(slack, {
        channelId,
        threadTs,
        recipientTeamId: teamId,
        recipientUserId: event.user,
      });
      placeholderMessageTs = stream.messageTs;
      placeholderIsStream = true;
    } catch {
    }
  }
  if (!placeholderMessageTs) {
    try {
      const placeholder = await postThreadMessage(
        slack,
        channelId,
        threadTs,
        "Tags is working…",
      );
      placeholderMessageTs = placeholder.messageTs;
    } catch {
    }
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
    placeholderMessageTs,
    placeholderIsStream,
  });

  await ack;

  return new Response("ok");
}
