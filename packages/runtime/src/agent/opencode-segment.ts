import type { TagsEvent } from "@tags/core/events";
import { truncateForPreview } from "@tags/core/ui-cards";
import { checkSpaceBudget } from "@tags/core/policies";
import { appendRunEvent, updateRunStatus } from "@tags/core/runs";
import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { recordUsage } from "@tags/core/usage";
import type { Db } from "@tags/db";
import { buildRunLinkBlock, SlackStreamAdapter } from "@tags/slack";
import type { AgentSegmentResult } from "./types";
import { buildOpencodePrompt } from "./prompt";
import { buildThreadContext } from "../context/builder";
import { maybeExtractMemories, maybeSummarizeThread } from "../context/post-run";
import {
  createRuntimeProviders,
  type RuntimeProviderConfig,
} from "../providers";

/**
 * The final Slack reply should be the agent's answer, not the opencode CLI
 * chrome. Strips the logo banner, the "build · <model>" header, share links,
 * and the appended git-diff section (still available in the run timeline).
 */
export function cleanOpencodeReply(raw: string): string {
  const withoutDiff = raw.split("\n--- git diff ---\n")[0] ?? raw;
  const cleaned = withoutDiff
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true;
      // Logo / banner art made of block-drawing glyphs.
      if (/^[█▀▄▌▐░▒▓─│┌┐└┘|>\s]+$/.test(trimmed)) return false;
      // "build · accounts/fireworks/routers/…" model header (optionally piped).
      if (/^[|│>]?\s*\w+\s+·\s+\S+/.test(trimmed) && trimmed.includes("·")) return false;
      // Share footer, e.g. "~ https://opencode.ai/s/…".
      if (/^~\s+https?:\/\//.test(trimmed)) return false;
      return true;
    })
    .join("\n");
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

export type OpencodeSegmentArgs = {
  db: Db;
  slack: import("@slack/web-api").WebClient;
  runId: string;
  spaceId: string;
  threadId: string;
  organizationId: string;
  channelId: string;
  slackMessageTs: string;
  /** Whether slackMessageTs is a native Slack stream (chat.startStream). */
  slackStream: boolean;
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
    { native: args.slackStream },
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
      // Raw opencode stdout is TUI noise (banner, "build · model" header) —
      // keep it in the run timeline (DB) but never stream it into Slack.
      onOutput: async (chunk) => {
        await appendRunEvent(args.db, args.runId, { type: "text.delta", text: chunk });
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
      cleanOpencodeReply(result.output) ||
      (result.exitCode === 0 ? "Done." : `opencode exited with code ${result.exitCode}.`);

    await stream.finalize(replyText, buildRunLinkBlock(args.appUrl, args.runId));
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
