import type { TagsEvent } from "@tags/core/events";
import { truncateForPreview } from "@tags/core/ui-cards";
import { checkSpaceBudget } from "@tags/core/policies";
import { appendRunEvent, updateRunStatus } from "@tags/core/runs";
import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { recordUsage } from "@tags/core/usage";
import type { Db } from "@tags/db";
import {
  buildRunLinkBlock,
  SlackStreamAdapter,
  updateMessage,
} from "@tags/slack";
import type { AgentSegmentResult } from "./types";
import { buildOpencodePrompt } from "./prompt";
import { buildThreadContext } from "../context/builder";
import { maybeExtractMemories, maybeSummarizeThread } from "../context/post-run";
import {
  createRuntimeProviders,
  type RuntimeProviderConfig,
} from "../providers";

export type OpencodeSegmentArgs = {
  db: Db;
  slack: import("@slack/web-api").WebClient;
  runId: string;
  spaceId: string;
  threadId: string;
  organizationId: string;
  channelId: string;
  slackMessageTs: string;
  triggerText: string;
  spaceName: string;
  appUrl: string;
  providerConfig: RuntimeProviderConfig;
};

/**
 * opencode-primary run path: thin Tags shell around opencode in E2B.
 * No outer AI SDK streamText loop — opencode IS the agent harness.
 * Composio MCP tools are not loaded on this path (see agent/loop.ts).
 */
export async function runOpencodeSegment(
  args: OpencodeSegmentArgs,
): Promise<AgentSegmentResult> {
  const config = await loadActiveSpaceConfig(args.db, args.spaceId);
  if (!config) {
    throw new Error(`No active space config for space ${args.spaceId}`);
  }

  const stream = new SlackStreamAdapter(
    args.slack,
    args.channelId,
    args.slackMessageTs,
  );

  const emit = async (event: TagsEvent) => {
    await appendRunEvent(args.db, args.runId, event);
    await stream.pushEvent(event);
  };

  const budget = await checkSpaceBudget(args.db, args.spaceId);
  if (!budget.allowed) {
    const message = `Monthly budget limit reached ($${(budget.spentMicroUsd / 1_000_000).toFixed(2)} of $${(budget.budgetMicroUsd / 1_000_000).toFixed(2)}).`;
    await emit({ type: "run.failed", error: message });
    await updateRunStatus(args.db, args.runId, "failed", {
      error: { code: "budget_exceeded", message },
      finishedAt: new Date(),
    });
    await stream.finalize(message);
    return { kind: "failed", text: message };
  }

  await updateRunStatus(args.db, args.runId, "streaming");
  await emit({ type: "status", label: "Reading thread context" });

  const messages = await buildThreadContext(
    args.db,
    args.threadId,
    args.organizationId,
    args.spaceId,
    args.triggerText,
  );
  const prompt = buildOpencodePrompt(config.instructions, args.spaceName, messages);

  const providers = await createRuntimeProviders(args.providerConfig);

  await emit({ type: "status", label: "Starting opencode agent in sandbox" });
  await emit({
    type: "tool.started",
    toolName: "opencode",
    inputPreview: { promptLength: prompt.length },
  });

  try {
    const result = await providers.sandbox.runCodingAgent({
      prompt,
      model: config.modelId,
      repoUrl: config.repoUrl ?? undefined,
      onOutput: async (chunk) => {
        await emit({ type: "text.delta", text: chunk });
      },
    });

    const uiCard = {
      kind: "coding-agent" as const,
      exitCode: result.exitCode,
      outputPreview: truncateForPreview(result.output, 600),
      ...(result.gitDiff ? { gitDiffPreview: truncateForPreview(result.gitDiff, 800) } : {}),
    };

    await emit({
      type: "tool.finished",
      toolName: "opencode",
      outputPreview: {
        exitCode: result.exitCode,
        output: result.output.slice(0, 12_000),
      },
      uiCard,
    });

    const replyText =
      result.output.trim() ||
      (result.exitCode === 0 ? "Done." : `opencode exited with code ${result.exitCode}.`);

    await stream.finalize(replyText);
    await updateMessage(
      args.slack,
      args.channelId,
      args.slackMessageTs,
      replyText,
      [...buildRunLinkBlock(args.appUrl, args.runId)],
    );
    await emit({ type: "run.finished" });

    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(result.output.length / 4);
    const tokenUsage = {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
    };

    await updateRunStatus(args.db, args.runId, "done", {
      finishedAt: new Date(),
      tokenUsage,
    });

    await recordUsage(args.db, {
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      runId: args.runId,
      modelId: config.modelId,
      promptTokens,
      completionTokens,
    });

    await maybeSummarizeThread(args.db, {
      threadId: args.threadId,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      fireworksApiKey: args.providerConfig.fireworksApiKey ?? "",
    });
    await maybeExtractMemories(args.db, {
      threadId: args.threadId,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      fireworksApiKey: args.providerConfig.fireworksApiKey ?? "",
    });

    return { kind: "complete", text: replyText };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await emit({ type: "run.failed", error: message });
    await updateRunStatus(args.db, args.runId, "failed", {
      error: { code: "opencode_error", message },
      finishedAt: new Date(),
    });
    await stream.finalize(`Run failed: ${message}`);
    throw error;
  }
}
