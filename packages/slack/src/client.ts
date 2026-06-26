import { WebClient } from "@slack/web-api";

export function createSlackClient(token: string): WebClient {
  return new WebClient(token);
}

export type SlackMessageRef = {
  channelId: string;
  messageTs: string;
};

export async function postThreadMessage(
  client: WebClient,
  channelId: string,
  threadTs: string,
  text: string,
  blocks?: unknown[],
): Promise<SlackMessageRef> {
  const result = await client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text,
    blocks: blocks as never,
  });

  if (!result.ok || !result.ts) {
    throw new Error(result.error ?? "Failed to post Slack message");
  }

  return { channelId, messageTs: result.ts };
}

export async function updateMessage(
  client: WebClient,
  channelId: string,
  messageTs: string,
  text: string,
  blocks?: unknown[],
): Promise<void> {
  const result = await client.chat.update({
    channel: channelId,
    ts: messageTs,
    text,
    blocks: blocks as never,
  });

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to update Slack message");
  }
}

export async function fetchThreadReplies(
  client: WebClient,
  channelId: string,
  threadTs: string,
): Promise<Array<{ ts: string; user?: string; text?: string; bot_id?: string }>> {
  const result = await client.conversations.replies({
    channel: channelId,
    ts: threadTs,
    inclusive: true,
  });

  if (!result.ok || !result.messages) {
    throw new Error(result.error ?? "Failed to fetch thread replies");
  }

  return result.messages as Array<{
    ts: string;
    user?: string;
    text?: string;
    bot_id?: string;
  }>;
}
