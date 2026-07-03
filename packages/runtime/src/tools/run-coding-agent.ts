import { z } from "zod";
import {
  acquireSpaceSandboxLease,
  getOrCreateSpaceSandboxSession,
  recordSpaceSandboxExternalId,
  releaseSpaceSandboxLease,
  type SpaceSandboxStatus,
} from "@tags/core/space-sandboxes";
import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { truncateForPreview } from "@tags/core/ui-cards";
import type { Db } from "@tags/db";
import { DEFAULT_OPENCODE_TEMPLATE, REPO_PATH, WORKDIR } from "@tags/sandbox";
import type { RuntimeProviderConfig } from "../providers";
import type { TagsTool } from "./types";

const inputSchema = z.object({
  prompt: z.string().describe("Coding task for the opencode agent to perform"),
  repoUrl: z.url().optional().describe("Optional git repo to clone before running"),
});

export function createRunCodingAgentTool(
  db: Db,
  providerConfig: RuntimeProviderConfig = {},
): TagsTool {
  return {
    name: "run_coding_agent",
    description:
      "Run the opencode coding agent in the persistent Space E2B sandbox to perform a coding task, optionally against the Space repo. Side effecting and may incur cost; requires approval.",
    inputSchema,
    risk: "high",
    approval: { kind: "always" },
    sideEffecting: true,
    async execute(input, ctx) {
      const parsed = inputSchema.parse(input);
      const config = await loadActiveSpaceConfig(db, ctx.spaceId);
      if (!config) {
        throw new Error(`No active space config for space ${ctx.spaceId}`);
      }

      const repoUrl = parsed.repoUrl ?? config.repoUrl ?? undefined;
      const sandboxSession = await getOrCreateSpaceSandboxSession(db, {
        organizationId: ctx.organizationId,
        spaceId: ctx.spaceId,
        template: providerConfig.e2bOpencodeTemplate ?? DEFAULT_OPENCODE_TEMPLATE,
        repoUrl,
        workdir: repoUrl ? REPO_PATH : WORKDIR,
      });
      const sandboxLease = await acquireSpaceSandboxLease(db, {
        spaceId: ctx.spaceId,
        runId: ctx.runId,
      });

      if (!sandboxLease) {
        const message =
          "The channel sandbox is busy with another coding run. Try again when it finishes.";
        await ctx.emit({ type: "status", label: "Channel sandbox busy", detail: message });
        return {
          modelOutput: {
            error: "space_sandbox_busy",
            message,
            sandboxSessionId: sandboxSession.id,
          },
          uiCard: {
            kind: "coding-agent",
            exitCode: 1,
            outputPreview: message,
          },
        };
      }

      let releaseStatus: SpaceSandboxStatus = "ready";

      try {
        const result = await ctx.sandbox.runCodingAgent({
          prompt: parsed.prompt,
          repoUrl,
          model: config.modelId,
          session: {
            sandboxId: sandboxLease.externalSandboxId,
            keepAlive: true,
          },
          onOutput: async (chunk) => {
            await ctx.emit({ type: "text.delta", text: chunk });
          },
        });

        await recordSpaceSandboxExternalId(db, {
          sessionId: sandboxSession.id,
          externalSandboxId: result.sandboxId,
          metadata: {
            createdSandbox: result.createdSandbox,
            reusedSandbox: result.reusedSandbox,
            runId: ctx.runId,
          },
        });

        await ctx.emit({
          type: "status",
          label: "Coding agent finished",
          detail: `exit ${result.exitCode}`,
        });

        return {
          modelOutput: {
            sandboxSessionId: sandboxSession.id,
            sandboxId: result.sandboxId,
            createdSandbox: result.createdSandbox,
            reusedSandbox: result.reusedSandbox,
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
      } catch (error) {
        releaseStatus = "failed";
        throw error;
      } finally {
        await releaseSpaceSandboxLease(db, {
          spaceId: ctx.spaceId,
          runId: ctx.runId,
          status: releaseStatus,
        });
      }
    },
  };
}
