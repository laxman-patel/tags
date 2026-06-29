import { z } from "zod";
import { truncateForPreview } from "@tags/core/ui-cards";
import { listThreadMessages } from "@tags/core/threads";
import type { Db } from "@tags/db";
import type { TagsTool, ToolContext } from "./types";

const inputSchema = z.object({
  query: z.string().optional().describe("Optional keyword filter"),
});

export function createSearchThreadTool(db: Db): TagsTool {
  return {
    name: "search_thread",
    description: "Search messages in the current thread (read-only).",
    inputSchema,
    risk: "none",
    approval: { kind: "never" },
    sideEffecting: false,
    async execute(input: unknown, ctx: ToolContext) {
      const parsed = inputSchema.parse(input);
      const messages = await listThreadMessages(db, ctx.threadId);
      const filtered = parsed.query
        ? messages.filter((m) =>
            m.text.toLowerCase().includes(parsed.query!.toLowerCase()),
          )
        : messages;

      const preview = filtered
        .slice(-20)
        .map((m) => `${m.authorId}: ${m.text.slice(0, 200)}`)
        .join("\n");

      return {
        modelOutput: {
          count: filtered.length,
          messages: filtered.slice(-20).map((m) => ({
            author: m.authorId,
            text: m.text.slice(0, 500),
          })),
        },
        uiCard: {
          kind: "thread-search",
          messageCount: filtered.length,
          preview: truncateForPreview(preview || "(no messages)"),
        },
      };
    },
  };
}
