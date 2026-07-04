import { z } from "zod";
import { searchSpaceSessions } from "@tags/core/session-search";
import { truncateForPreview } from "@tags/core/ui-cards";
import type { Db } from "@tags/db";
import type { TagsTool } from "./types";

const inputSchema = z.object({
  query: z.string().optional().describe("Search query for prior Space threads"),
  limit: z.number().int().min(1).max(10).optional(),
  sort: z.enum(["relevance", "newest", "oldest"]).optional(),
  roleFilter: z.array(z.enum(["human", "agent", "system"])).optional(),
  threadId: z.string().optional(),
  aroundMessageId: z.string().optional(),
  window: z.number().int().min(1).max(20).optional(),
});

function preview(results: Awaited<ReturnType<typeof searchSpaceSessions>>): string {
  return results
    .map((result) => {
      const lines = result.messages
        .slice(0, 6)
        .map((message) => `${message.authorId}: ${message.text.slice(0, 160)}`)
        .join("\n");
      return `Thread ${result.threadId}${result.snippet ? `\nMatch: ${result.snippet}` : ""}\n${lines}`;
    })
    .join("\n\n");
}

export function createSessionSearchTool(db: Db): TagsTool {
  return {
    name: "session_search",
    description:
      "Search prior Slack threads in this Space. Use when the user references earlier work, last time, prior decisions, or context outside the current thread.",
    inputSchema,
    risk: "none",
    approval: { kind: "never" },
    sideEffecting: false,
    async execute(input: unknown, ctx) {
      const parsed = inputSchema.parse(input);
      const results = await searchSpaceSessions(db, {
        organizationId: ctx.organizationId,
        spaceId: ctx.spaceId,
        query: parsed.query,
        limit: parsed.limit,
        sort: parsed.sort,
        roleFilter: parsed.roleFilter,
        threadId: parsed.threadId,
        aroundMessageId: parsed.aroundMessageId,
        window: parsed.window,
      });

      return {
        modelOutput: { results },
        uiCard: {
          kind: "generic",
          title: parsed.query ? `Session search: ${parsed.query}` : "Recent Space threads",
          body: truncateForPreview(preview(results) || "(no prior thread matches)", 800),
        },
      };
    },
  };
}
