import { z } from "zod";
import { truncateForPreview } from "@tags/core/ui-cards";
import {
  addMemoryEntry,
  loadSpaceMemoryFile,
  memoryUsage,
  MemoryFullError,
  mutateSpaceMemoryFile,
  removeMemoryEntryBySubstring,
  replaceMemoryEntryBySubstring,
} from "@tags/core/file-memory";
import type { Db } from "@tags/db";
import type { TagsTool, ToolContext } from "./types";

const inputSchema = z.object({
  action: z.enum(["add", "replace", "remove", "list"]).default("add"),
  content: z.string().optional().describe("Memory content to save or replace with"),
  oldText: z.string().optional().describe("Unique substring identifying the entry to replace/remove"),
});

export function createSaveMemoryTool(db: Db): TagsTool {
  return {
    name: "save_memory",
    description:
      "Manage the Space MEMORY.md file. Add durable Space facts/preferences, replace or remove entries by unique substring, or list entries and char usage.",
    inputSchema,
    risk: "low",
    approval: { kind: "never" },
    sideEffecting: true,
    async execute(input: unknown, ctx: ToolContext) {
      if (!ctx.r2) {
        throw new Error("R2 memory storage is not configured");
      }

      const parsed = inputSchema.parse(input);
      const context = {
        db,
        organizationId: ctx.organizationId,
        spaceId: ctx.spaceId,
        actorType: "agent" as const,
        sourceThreadId: ctx.threadId,
      };

      if (parsed.action === "list") {
        const memory = await loadSpaceMemoryFile(ctx.r2, ctx);
        return {
          modelOutput: {
            ok: true,
            action: "list",
            entries: memory.entries,
            usage: memoryUsage(memory),
          },
          uiCard: {
            kind: "generic",
            title: "Space memory",
            body:
              memory.entries.map((entry) => `- ${entry.content}`).join("\n") ||
              "(no memory entries)",
          },
        };
      }

      try {
        if (parsed.action === "remove") {
          if (!parsed.oldText?.trim()) throw new Error("oldText is required for remove");
          const result = await mutateSpaceMemoryFile(ctx.r2, context, (memory) =>
            removeMemoryEntryBySubstring(memory, parsed.oldText!),
          );
          return {
            modelOutput: {
              ok: true,
              action: "remove",
              removed: result.removed,
              entries: result.memory.entries,
              usage: memoryUsage(result.memory),
            },
            uiCard: {
              kind: "generic",
              title: "Removed memory",
              body: truncateForPreview(parsed.oldText, 200),
            },
          };
        }

        if (parsed.action === "replace") {
          if (!parsed.oldText?.trim()) throw new Error("oldText is required for replace");
          if (!parsed.content?.trim()) throw new Error("content is required for replace");
          const result = await mutateSpaceMemoryFile(ctx.r2, context, (memory) =>
            replaceMemoryEntryBySubstring(memory, parsed.oldText!, parsed.content!),
          );
          return {
            modelOutput: {
              ok: true,
              action: "replace",
              replaced: result.replaced,
              entries: result.memory.entries,
              usage: memoryUsage(result.memory),
            },
            uiCard: {
              kind: "memory-saved",
              memoryKind: "replace",
              content: truncateForPreview(parsed.content, 200),
            },
          };
        }

        if (!parsed.content?.trim()) throw new Error("content is required for add");
        const result = await mutateSpaceMemoryFile(ctx.r2, context, (memory) =>
          addMemoryEntry(memory, parsed.content!),
        );
        return {
          modelOutput: {
            ok: true,
            action: "add",
            duplicate: result.duplicate ?? false,
            entries: result.memory.entries,
            usage: memoryUsage(result.memory),
          },
          uiCard: {
            kind: "memory-saved",
            memoryKind: result.duplicate ? "duplicate" : "add",
            content: truncateForPreview(parsed.content, 200),
          },
        };
      } catch (error) {
        if (error instanceof MemoryFullError) {
          return {
            modelOutput: {
              ok: false,
              error: error.message,
              usage: error.usage,
              currentEntries: error.entries.map((entry) => entry.content),
            },
            uiCard: {
              kind: "generic",
              title: "Memory full",
              body: `${error.message}\n\nCurrent entries:\n${error.entries
                .map((entry) => `- ${entry.content}`)
                .join("\n")}`,
            },
          };
        }
        throw error;
      }
    },
  };
}
