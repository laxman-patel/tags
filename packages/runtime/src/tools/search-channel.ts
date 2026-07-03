import { z } from "zod";
import { truncateForPreview } from "@tags/core/ui-cards";
import { fetchChannelHistory } from "@tags/slack";
import type { TagsTool } from "./types";

const inputSchema = z.object({
  query: z.string().optional().describe("Optional keyword filter"),
  limit: z.number().int().min(1).max(100).optional().describe("Max messages to fetch"),
});

export function createSearchChannelTool(
  createSlackClient: (token: string) => import("@slack/web-api").WebClient,
  slackBotToken?: string,
): TagsTool {
  return {
    name: "search_channel",
    description: "Search recent top-level messages in this Slack channel (read-only).",
    inputSchema,
    risk: "none",
    approval: { kind: "never" },
    sideEffecting: false,
    async execute(input: unknown, ctx) {
      if (!slackBotToken) {
        throw new Error("Slack bot token is not configured");
      }

      const parsed = inputSchema.parse(input);
      const client = createSlackClient(slackBotToken);
      const messages = await fetchChannelHistory(client, ctx.channelId, {
        limit: parsed.limit ?? 50,
      });
      const filtered = parsed.query
        ? messages.filter((message) =>
            (message.text ?? "").toLowerCase().includes(parsed.query!.toLowerCase()),
          )
        : messages;

      const preview = filtered
        .slice(-20)
        .map((message) => {
          const author = message.user ?? message.bot_id ?? "unknown";
          return `${author}: ${(message.text ?? "").slice(0, 200)}`;
        })
        .join("\n");

      return {
        modelOutput: {
          count: filtered.length,
          messages: filtered.slice(-20).map((message) => ({
            author: message.user ?? message.bot_id ?? "unknown",
            text: (message.text ?? "").slice(0, 500),
            replyCount: message.reply_count ?? 0,
          })),
        },
        uiCard: {
          kind: "channel-search",
          messageCount: filtered.length,
          preview: truncateForPreview(preview || "(no messages)"),
        },
      };
    },
  };
}