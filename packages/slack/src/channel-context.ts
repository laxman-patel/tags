import type { WebClient } from "@slack/web-api";
import type { SlackChannelMessage } from "./client";

const IGNORED_SUBTYPES = new Set([
  "channel_join",
  "channel_leave",
  "group_join",
  "group_leave",
  "bot_add",
  "bot_remove",
  "channel_name",
  "channel_purpose",
  "channel_topic",
  "pinned_item",
  "unpinned_item",
]);

const MAX_CHANNEL_CONTEXT_CHARS = 20_000;

function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/<@[^>]+>/g, " ")
    .replace(/@tags/g, " ")
    .replace(/[^\p{L}\p{N}_?]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isChannelContextRequest(text: string): boolean {
  const normalized = normalizeQuestion(text);
  if (!normalized) return false;

  return [
    /\b(this|the|whole)\s+channel\b/,
    /\bchannel\b.*\b(summar|convo|conversation|history|messages|activity|discussion)\b/,
    /\b(summar|convo|conversation|recap)\b.*\b(channel)\b/,
    /\bacross the channel\b/,
    /\bin the channel\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function isTopLevelChannelMessage(message: SlackChannelMessage): boolean {
  if (!message.ts) return false;
  if (message.subtype && IGNORED_SUBTYPES.has(message.subtype)) return false;
  if (message.thread_ts && message.thread_ts !== message.ts) return false;
  return Boolean(message.text?.trim()) || (message.files?.length ?? 0) > 0;
}

export function formatChannelContext(messages: readonly SlackChannelMessage[]): string {
  if (messages.length === 0) {
    return "Recent channel messages:\n(No recent channel messages found.)";
  }

  const lines = messages.map((message) => {
    const author = message.user ?? message.bot_id ?? "unknown";
    const body = message.text?.trim() || "(attachment)";
    const replyNote =
      message.reply_count && message.reply_count > 0
        ? ` (${message.reply_count} replies in thread)`
        : "";
    return `- ${author}: ${body}${replyNote}`;
  });

  return `Recent channel messages (oldest first, top-level posts only):\n${lines.join("\n")}`;
}

export function packChannelContext(text: string): string {
  if (text.length <= MAX_CHANNEL_CONTEXT_CHARS) return text;

  const lines = text.split("\n");
  const header = lines[0] ?? "Recent channel messages:";
  const body = lines.slice(1);
  const packed: string[] = [];

  let chars = header.length;
  for (let i = body.length - 1; i >= 0; i--) {
    const line = body[i]!;
    if (chars + line.length + 1 > MAX_CHANNEL_CONTEXT_CHARS && packed.length > 0) break;
    packed.unshift(line);
    chars += line.length + 1;
  }

  if (packed.length < body.length) {
    packed.unshift("[Earlier channel messages omitted to fit context budget.]");
  }

  return [header, ...packed].join("\n");
}

export async function buildChannelContextBlock(
  client: WebClient,
  channelId: string,
  options?: { limit?: number },
): Promise<string> {
  const { fetchChannelHistory } = await import("./client");
  const messages = await fetchChannelHistory(client, channelId, options);
  return packChannelContext(formatChannelContext(messages));
}
