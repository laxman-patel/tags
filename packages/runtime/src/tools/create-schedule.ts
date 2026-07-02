import { z } from "zod";
import { createSchedule } from "@tags/core/schedules";
import type { Db } from "@tags/db";
import type { TagsTool, ToolContext } from "./types";

const inputSchema = z.object({
  cron: z.string().describe("Cron expression, e.g. 0 11 * * *"),
  timezone: z.string().default("UTC").describe("IANA timezone"),
  prompt: z.string().describe("Task prompt to run on schedule"),
});

export function createCreateScheduleTool(db: Db): TagsTool {
  return {
    name: "create_schedule",
    description:
      "Create a recurring scheduled task for this Space (requires human approval).",
    inputSchema,
    risk: "high",
    approval: { kind: "always" },
    sideEffecting: true,
    async execute(input: unknown, ctx: ToolContext) {
      const parsed = inputSchema.parse(input);

      const row = await createSchedule(db, {
        organizationId: ctx.organizationId,
        spaceId: ctx.spaceId,
        cron: parsed.cron,
        timezone: parsed.timezone,
        prompt: parsed.prompt,
      });

      return {
        modelOutput: {
          scheduleId: row?.id,
          cron: parsed.cron,
          timezone: parsed.timezone,
          prompt: parsed.prompt,
        },
        uiCard: {
          kind: "schedule-created",
          cron: parsed.cron,
          promptPreview: parsed.prompt.slice(0, 120),
        },
      };
    },
  };
}
