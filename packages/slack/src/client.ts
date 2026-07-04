import { WebClient } from "@slack/web-api";
import { globalSlackRateLimiter } from "./rate-limit";

export function createSlackClient(token: string): WebClient {
  return new WebClient(token);
}

export type SlackMessageRef = {
  channelId: string;
  messageTs: string;
};

/** Chunk objects accepted by chat.appendStream / chat.stopStream. */
export type SlackStreamChunk =
  | { type: "markdown_text"; text: string }
  | {
      type: "task_update";
      id: string;
      title: string;
      status: "pending" | "in_progress" | "complete" | "error";
      details?: string;
      output?: string;
    }
  | { type: "plan_update"; title: string }
  | { type: "blocks"; blocks: Array<Record<string, unknown>> };

/**
 * Start a native Slack streaming message (chat.startStream). Shows the animated
 * "<App> is thinking…" indicator in the thread until content is appended.
 * Requires recipient team + user ids when streaming to channels.
 */
export async function startStream(
  client: WebClient,
  args: {
    channelId: string;
    threadTs: string;
    recipientTeamId: string;
    recipientUserId: string;
  },
): Promise<SlackMessageRef> {
  await globalSlackRateLimiter.acquire(args.channelId);

  try {
    const result = await client.chat.startStream({
      channel: args.channelId,
      thread_ts: args.threadTs,
      recipient_team_id: args.recipientTeamId,
      recipient_user_id: args.recipientUserId,
    });

    if (!result.ok || !result.ts) {
      throw new Error(result.error ?? "Failed to start Slack stream");
    }

    return { channelId: args.channelId, messageTs: result.ts };
  } catch (error) {
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) {
      await sleep(retryAfter * 1000);
      return startStream(client, args);
    }
    throw error;
  }
}

export async function appendStream(
  client: WebClient,
  channelId: string,
  messageTs: string,
  chunks: SlackStreamChunk[],
): Promise<void> {
  await globalSlackRateLimiter.acquire(channelId);

  try {
    const result = await client.chat.appendStream({
      channel: channelId,
      ts: messageTs,
      chunks: chunks as never,
    });

    if (!result.ok) {
      throw new Error(result.error ?? "Failed to append Slack stream");
    }
  } catch (error) {
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) {
      await sleep(retryAfter * 1000);
      await appendStream(client, channelId, messageTs, chunks);
      return;
    }
    throw error;
  }
}

export async function stopStream(
  client: WebClient,
  channelId: string,
  messageTs: string,
  args?: {
    chunks?: SlackStreamChunk[];
    /** Rendered at the bottom of the finalized message. */
    blocks?: unknown[];
  },
): Promise<void> {
  await globalSlackRateLimiter.acquire(channelId);

  try {
    const result = await client.chat.stopStream({
      channel: channelId,
      ts: messageTs,
      ...(args?.chunks ? { chunks: args.chunks as never } : {}),
      ...(args?.blocks ? { blocks: args.blocks as never } : {}),
    });

    if (!result.ok) {
      throw new Error(result.error ?? "Failed to stop Slack stream");
    }
  } catch (error) {
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) {
      await sleep(retryAfter * 1000);
      await stopStream(client, channelId, messageTs, args);
      return;
    }
    throw error;
  }
}

export async function postThreadMessage(
  client: WebClient,
  channelId: string,
  threadTs: string | undefined,
  text: string,
  blocks?: unknown[],
): Promise<SlackMessageRef> {
  await globalSlackRateLimiter.acquire(channelId);

  try {
    const result = await client.chat.postMessage({
      channel: channelId,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      text,
      blocks: blocks as never,
    });

    if (!result.ok || !result.ts) {
      throw new Error(result.error ?? "Failed to post Slack message");
    }

    return { channelId, messageTs: result.ts };
  } catch (error) {
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) {
      await sleep(retryAfter * 1000);
      return postThreadMessage(client, channelId, threadTs, text, blocks);
    }
    throw error;
  }
}

export async function uploadThreadFile(
  client: WebClient,
  args: {
    channelId: string;
    threadTs: string;
    file: Buffer;
    filename: string;
    title: string;
    initialComment?: string;
  },
): Promise<{ fileId?: string; permalink?: string }> {
  await globalSlackRateLimiter.acquire(args.channelId);

  try {
    const filesClient = client.files as unknown as {
      uploadV2: (input: {
        channel_id: string;
        thread_ts: string;
        file: Buffer;
        filename: string;
        title: string;
        initial_comment?: string;
      }) => Promise<{
        ok?: boolean;
        file?: { id?: string; permalink?: string };
        files?: Array<{ id?: string; permalink?: string }>;
        error?: string;
      }>;
    };
    const result = await filesClient.uploadV2({
      channel_id: args.channelId,
      thread_ts: args.threadTs,
      file: args.file,
      filename: args.filename,
      title: args.title,
      ...(args.initialComment ? { initial_comment: args.initialComment } : {}),
    });

    if (!result.ok) {
      throw new Error(result.error ?? "Failed to upload Slack file");
    }

    const file = result.file ?? result.files?.[0];
    return { fileId: file?.id, permalink: file?.permalink };
  } catch (error) {
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) {
      await sleep(retryAfter * 1000);
      return uploadThreadFile(client, args);
    }
    throw error;
  }
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

export type SlackFileRef = {
  id: string;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
};

export type SlackThreadMessage = {
  ts: string;
  user?: string;
  text?: string;
  bot_id?: string;
  files?: SlackFileRef[];
};

export type SlackChannelMessage = SlackThreadMessage & {
  reply_count?: number;
  thread_ts?: string;
  subtype?: string;
};

export async function fetchChannelHistory(
  client: WebClient,
  channelId: string,
  options?: { limit?: number },
): Promise<SlackChannelMessage[]> {
  const { isTopLevelChannelMessage } = await import("./channel-context");
  await globalSlackRateLimiter.acquire(channelId);
  const result = await client.conversations.history({
    channel: channelId,
    limit: options?.limit ?? 50,
  });

  if (!result.ok || !result.messages) {
    throw new Error(result.error ?? "Failed to fetch channel history");
  }

  return (result.messages as SlackChannelMessage[])
    .filter(isTopLevelChannelMessage)
    .reverse();
}

export async function fetchThreadReplies(
  client: WebClient,
  channelId: string,
  threadTs: string,
): Promise<SlackThreadMessage[]> {
  await globalSlackRateLimiter.acquire(channelId);
  const result = await client.conversations.replies({
    channel: channelId,
    ts: threadTs,
    inclusive: true,
  });

  if (!result.ok || !result.messages) {
    throw new Error(result.error ?? "Failed to fetch thread replies");
  }

  return result.messages as SlackThreadMessage[];
}

export async function addReaction(
  client: WebClient,
  channelId: string,
  messageTs: string,
  emoji: string,
): Promise<void> {
  await globalSlackRateLimiter.acquire(channelId);
  try {
    await client.reactions.add({ channel: channelId, timestamp: messageTs, name: emoji });
  } catch (error) {
    if (isIgnorableReactionError(error, "already_reacted")) return;
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) {
      await sleep(retryAfter * 1000);
      return addReaction(client, channelId, messageTs, emoji);
    }
    throw error;
  }
}

export async function removeReaction(
  client: WebClient,
  channelId: string,
  messageTs: string,
  emoji: string,
): Promise<void> {
  await globalSlackRateLimiter.acquire(channelId);
  try {
    await client.reactions.remove({ channel: channelId, timestamp: messageTs, name: emoji });
  } catch (error) {
    if (isIgnorableReactionError(error, "no_reaction")) return;
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) {
      await sleep(retryAfter * 1000);
      return removeReaction(client, channelId, messageTs, emoji);
    }
    throw error;
  }
}

function isIgnorableReactionError(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const data = (error as { data?: { error?: string } }).data;
  return data?.error === code;
}

function extractRetryAfter(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const data = (error as { data?: { retryAfter?: number } }).data;
  return data?.retryAfter ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
