import { z } from "zod";
import { searchMemories } from "@tags/core/memory";
import type { Db } from "@tags/db";
import type { TagsTool, ToolContext } from "./types";

const inputSchema = z.object({
  query: z.string().describe("Search query for space memory"),
});

export function createSearchMemoryTool(db: Db): TagsTool {
  return {
    name: "search_memory",
    description: "Search durable facts and preferences saved for this Space.",
    inputSchema,
    risk: "none",
    approval: { kind: "never" },
    sideEffecting: false,
    async execute(input: unknown, ctx: ToolContext) {
      const parsed = inputSchema.parse(input);
      const rows = await searchMemories(db, ctx.spaceId, parsed.query);
      return {
        modelOutput: rows.map((r) => ({ kind: r.kind, content: r.content, id: r.id })),
      };
    },
  };
}
