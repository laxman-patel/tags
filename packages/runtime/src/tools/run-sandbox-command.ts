import { z } from "zod";
import type { TagsTool } from "./types";

const inputSchema = z.object({
  command: z.string().describe("Shell command to run, e.g. node"),
  args: z.array(z.string()).default([]).describe("Command arguments"),
  runtime: z.string().optional().describe("Sandbox runtime, e.g. node24"),
});

export function createRunSandboxCommandTool(): TagsTool {
  return {
    name: "run_sandbox_command",
    description:
      "Run a shell command in an isolated Vercel Sandbox. Side effecting: spins up a sandbox, may incur cost and network egress; requires approval.",
    inputSchema,
    risk: "high",
    approval: { kind: "always" },
    sideEffecting: true,
    async execute(input, ctx) {
      const parsed = inputSchema.parse(input);
      const session = await ctx.sandbox.create({ runtime: parsed.runtime });

      try {
        const result = await session.runCommand(parsed.command, parsed.args);
        await ctx.emit({
          type: "status",
          label: "Sandbox command finished",
          detail: `exit ${result.exitCode}`,
        });

        return {
          modelOutput: {
            sandboxId: session.id,
            exitCode: result.exitCode,
            stdout: result.stdout.slice(0, 8000),
            stderr: result.stderr.slice(0, 2000),
          },
        };
      } finally {
        await session.stop();
      }
    },
  };
}
