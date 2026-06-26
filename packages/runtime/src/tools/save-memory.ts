import { z } from "zod";
import { saveMemory } from "@tags/core/memory";
import type { Db } from "@tags/db";
import type { TagsTool, ToolContext } from "./types";

const inputSchema = z.object({
  content: z.string().describe("Memory content to save"),
  kind: z.enum(["fact", "preference", "decision", "summary"]).default("fact"),
});

export function createSaveMemoryTool(db: Db): TagsTool {
  return {
    name: "save_memory",
    description: "Save a durable fact or preference to Space memory.",
    inputSchema,
    risk: "low",
    approval: { kind: "never" },
    sideEffecting: true,
    async execute(input: unknown, ctx: ToolContext) {
      const parsed = inputSchema.parse(input);
      const row = await saveMemory(db, {
        organizationId: ctx.organizationId,
        spaceId: ctx.spaceId,
        kind: parsed.kind,
        content: parsed.content,
        createdBy: "agent",
        sourceThreadId: ctx.threadId,
      });
      return {
        modelOutput: { saved: true, id: row?.id, content: parsed.content },
      };
    },
  };
}
