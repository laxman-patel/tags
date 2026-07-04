import { z } from "zod";
import { loadSpaceMemoryFile, searchMemoryEntries } from "@tags/core/file-memory";
import type { Db } from "@tags/db";
import type { TagsTool, ToolContext } from "./types";

const inputSchema = z.object({
  query: z.string().describe("Search query for space memory"),
});

export function createSearchMemoryTool(db: Db): TagsTool {
  return {
    name: "search_memory",
    description: "Search the Space MEMORY.md file for durable facts and preferences.",
    inputSchema,
    risk: "none",
    approval: { kind: "never" },
    sideEffecting: false,
    async execute(input: unknown, ctx: ToolContext) {
      if (!ctx.r2) {
        throw new Error("R2 memory storage is not configured");
      }

      const parsed = inputSchema.parse(input);
      const memory = await loadSpaceMemoryFile(ctx.r2, {
        organizationId: ctx.organizationId,
        spaceId: ctx.spaceId,
      });
      const matches = searchMemoryEntries(memory, parsed.query).slice(0, 20);
      const items = matches.map((entry) => ({ kind: "memory", content: entry.content }));
      return {
        modelOutput: {
          query: parsed.query,
          count: matches.length,
          items,
        },
        uiCard: {
          kind: "memory-search",
          query: parsed.query,
          items: items.slice(0, 5),
        },
      };
    },
  };
}
