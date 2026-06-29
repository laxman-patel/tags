import { z } from "zod";
import { truncateForPreview } from "@tags/core/ui-cards";
import type { TagsTool } from "./types";

const inputSchema = z.object({
  prompt: z.string().describe("Coding task for the opencode agent to perform"),
  repoUrl: z.string().url().optional().describe("Optional git repo to clone before running"),
});

export function createRunCodingAgentTool(): TagsTool {
  return {
    name: "run_coding_agent",
    description:
      "Run the opencode coding agent in an isolated E2B sandbox to perform a coding task, optionally against a cloned git repo. Side effecting (spins up a sandbox, may incur cost); requires approval.",
    inputSchema,
    risk: "high",
    approval: { kind: "always" },
    sideEffecting: true,
    async execute(input, ctx) {
      const parsed = inputSchema.parse(input);
      const result = await ctx.sandbox.runCodingAgent({
        prompt: parsed.prompt,
        repoUrl: parsed.repoUrl,
        onOutput: async (chunk) => {
          await ctx.emit({ type: "text.delta", text: chunk });
        },
      });

      await ctx.emit({
        type: "status",
        label: "Coding agent finished",
        detail: `exit ${result.exitCode}`,
      });

      return {
        modelOutput: {
          sandboxId: result.sandboxId,
          exitCode: result.exitCode,
          output: result.output.slice(0, 12_000),
        },
        uiCard: {
          kind: "coding-agent",
          exitCode: result.exitCode,
          outputPreview: truncateForPreview(result.output, 600),
          ...(result.gitDiff ? { gitDiffPreview: truncateForPreview(result.gitDiff, 800) } : {}),
        },
      };
    },
  };
}
