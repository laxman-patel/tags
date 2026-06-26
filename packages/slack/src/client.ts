import { WebClient } from "@slack/web-api";
import { globalSlackRateLimiter } from "./rate-limit";

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
  await globalSlackRateLimiter.acquire(channelId);
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
  await globalSlackRateLimiter.acquire(channelId);

  try {
    const result = await client.chat.update({
      channel: channelId,
      ts: messageTs,
      text,
      blocks: blocks as never,
    });

    if (!result.ok) {
      throw new Error(result.error ?? "Failed to update Slack message");
    }
  } catch (error) {
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) {
      await sleep(retryAfter * 1000);
      await updateMessage(client, channelId, messageTs, text, blocks);
      return;
    }
    throw error;
  }
}

export async function fetchThreadReplies(
  client: WebClient,
  channelId: string,
  threadTs: string,
): Promise<Array<{ ts: string; user?: string; text?: string; bot_id?: string }>> {
  await globalSlackRateLimiter.acquire(channelId);
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

function extractRetryAfter(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const data = (error as { data?: { retryAfter?: number } }).data;
  return data?.retryAfter ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
