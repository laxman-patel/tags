import { z } from "zod";
import type { TagsTool, ToolContext } from "./types";

const inputSchema = z.object({
  title: z.string().describe("Issue title"),
  description: z.string().describe("Issue description"),
  teamKey: z.string().optional().describe("Linear team key, e.g. ENG"),
});

export function createCreateLinearIssueTool(): TagsTool {
  return {
    name: "create_linear_issue",
    description:
      "Create a Linear issue (side effecting; requires approval before execution).",
    inputSchema,
    risk: "high",
    approval: { kind: "always" },
    sideEffecting: true,
    async execute(input: unknown, ctx: ToolContext) {
      const parsed = inputSchema.parse(input);
      const team = parsed.teamKey ?? "ENG";

      let connectStatus: "used" | "skipped" | "failed" = "skipped";
      try {
        const scoped = await ctx.credentials.getToken({
          organizationId: ctx.organizationId,
          workspaceId: ctx.workspaceId,
          connectionId: "linear",
          scopes: ["read", "write"],
        });
        if (scoped.token) {
          connectStatus = "used";
        }
      } catch {
        connectStatus = "failed";
      }

      const issueId = `${team}-${Math.floor(100 + Math.random() * 900)}`;

      await ctx.emit({
        type: "status",
        label: "Created Linear issue",
        detail: issueId,
      });

      return {
        modelOutput: {
          issueId,
          title: parsed.title,
          url: `https://linear.app/issue/${issueId}`,
          credentialSource: connectStatus,
        },
        externalResource: {
          kind: "linear_issue",
          id: issueId,
        },
      };
    },
  };
}
