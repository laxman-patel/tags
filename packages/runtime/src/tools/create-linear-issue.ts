import { z } from "zod";
import type { TagsTool } from "./types";

const inputSchema = z.object({
  title: z.string().describe("Issue title"),
  description: z.string().describe("Issue description"),
  teamKey: z.string().optional().describe("Linear team key, e.g. ENG"),
});

export function createCreateLinearIssueTool(): TagsTool {
  return {
    name: "create_linear_issue",
    description:
      "Mock Linear issue creation (no real Linear API call yet). Side effecting; requires approval before execution.",
    inputSchema,
    risk: "high",
    approval: { kind: "always" },
    sideEffecting: true,
    async execute(input, ctx) {
      const parsed = inputSchema.parse(input);
      const team = parsed.teamKey ?? "ENG";

      const issueId = `${team}-${Math.floor(100 + Math.random() * 900)}`;

      await ctx.emit({
        type: "status",
        label: "Created mock Linear issue",
        detail: issueId,
      });

      return {
        modelOutput: {
          issueId,
          title: parsed.title,
          url: `https://linear.app/issue/${issueId}`,
          mock: true,
        },
        externalResource: {
          kind: "linear_issue",
          id: issueId,
        },
      };
    },
  };
}
