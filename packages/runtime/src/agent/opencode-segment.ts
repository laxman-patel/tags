import type { TagsEvent } from "@tags/core/events";
import { TAGS_MODEL_ID } from "@tags/core/model-labels";
import { formatToolResultForUser, truncateForPreview } from "@tags/core/ui-cards";
import type { UICard } from "@tags/core/ui-cards";
import { checkSpaceBudget } from "@tags/core/policies";
import { formatMemoryPromptBlock, loadSpaceMemoryFile } from "@tags/core/file-memory";
import { appendRunEvent, getPendingApprovalByRunId, updateRunStatus } from "@tags/core/runs";
import { getPendingQuestionByRunId } from "@tags/core/questions";
import {
  acquireSpaceSandboxLease,
  getOrCreateSpaceSandboxSession,
  recordSpaceSandboxExternalId,
  releaseSpaceSandboxLease,
  type SpaceSandboxStatus,
} from "@tags/core/space-sandboxes";
import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { recordUsage } from "@tags/core/usage";
import type { Db } from "@tags/db";
import { DEFAULT_OPENCODE_TEMPLATE, REPO_PATH, REPOS_ROOT, WORKDIR } from "@tags/sandbox";
import { buildChannelContextBlock, buildRunLinkBlock, isChannelContextRequest, SlackStreamAdapter } from "@tags/slack";
import type { AgentSegmentResult } from "./types";
import { buildCapabilitiesReply, isCapabilityInventoryQuestion } from "./capabilities";
import { buildOpencodeSystemPrompt, buildOpencodeUserPrompt } from "./prompt";
import { buildThreadContext } from "../context/builder";
import { maybeExtractMemories, maybeSummarizeThread } from "../context/post-run";
import {
  createRuntimeProviders,
  type RuntimeProviderConfig,
} from "../providers";
import {
  buildComposioMcpRunToken,
  createComposioMcpProxyConfig,
  type ComposioMcpServerConfig,
} from "../tools/composio-mcp-proxy";
import {
  buildTagsMcpRunToken,
  createTagsMcpServerConfig,
  type TagsMcpServerConfig,
} from "../tools/tags-mcp";

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

export type OpencodeContinuation =
  | {
      kind: "approved_tool";
      toolName: string;
      toolInput: unknown;
      toolOutput: unknown;
      uiCard?: UICard;
    }
  | {
      kind: "question_answered";
      questionText: string;
      answer: string;
    };

export type OpencodeSegmentArgs = {
  db: Db;
  slack: import("@slack/web-api").WebClient;
  runId: string;
  spaceId: string;
  workspaceId: string;
  threadId: string;
  organizationId: string;
  channelId: string;
  slackMessageTs: string;
  /** Whether slackMessageTs is a native Slack stream (chat.startStream). */
  slackStream: boolean;
  triggerText: string;
  actorSlackUserId: string;
  spaceName: string;
  appUrl: string;
  providerConfig: RuntimeProviderConfig;
  /** When set, appends a continuation message to the opencode prompt for HITL resume. */
  continuation?: OpencodeContinuation;
};

/**
 * opencode-primary run path: thin Tags shell around opencode in E2B.
 * No outer AI SDK streamText loop — opencode IS the agent harness.
 * Space Composio connections are exposed to opencode as a remote MCP server.
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
  const providers = await createRuntimeProviders(args.providerConfig);

  if (isCapabilityInventoryQuestion(args.triggerText)) {
    await emit({ type: "status", label: "Reading Space capabilities" });

    const replyText = buildCapabilitiesReply({
      spaceName: args.spaceName,
      enabledTools: config.enabledTools,
      enabledConnections: config.enabledConnections,
      hasComposioApiKey: Boolean(args.providerConfig.composioApiKey),
    });

    await stream.finalize(replyText, buildRunLinkBlock(args.appUrl, args.runId));
    await emit({ type: "run.finished" });
    await updateRunStatus(args.db, args.runId, "done", {
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      finishedAt: new Date(),
    });

    return { kind: "complete", text: replyText };
  }

  let spaceMemorySnapshot: string | null = null;
  if (providers.r2) {
    await emit({ type: "status", label: "Reading Space memory" });
    try {
      const memory = await loadSpaceMemoryFile(providers.r2, {
        organizationId: args.organizationId,
        spaceId: args.spaceId,
      });
      spaceMemorySnapshot = formatMemoryPromptBlock(memory);
    } catch (error) {
      await emit({
        type: "status",
        label: "Space memory unavailable",
        detail: error instanceof Error ? error.message : "Failed to load Space memory",
      });
    }
  }

  await emit({ type: "status", label: "Reading thread context" });
  const messages = await buildThreadContext(
    args.db,
    args.threadId,
    args.organizationId,
    args.spaceId,
    args.triggerText,
  );

  if (isChannelContextRequest(args.triggerText)) {
    await emit({ type: "status", label: "Reading channel context" });
    try {
      const channelBlock = await buildChannelContextBlock(args.slack, args.channelId);
      messages.unshift({
        role: "user",
        content: channelBlock,
      });
    } catch (error) {
      await emit({
        type: "status",
        label: "Channel context unavailable",
        detail: error instanceof Error ? error.message : "Failed to fetch channel history",
      });
    }
  }

  const repoUrls = config.repoUrls?.length ? config.repoUrls : [];
  const primaryRepoUrl = repoUrls[0] ?? config.repoUrl ?? null;
  const multiRepo = repoUrls.length > 1;
  const workdir = multiRepo ? REPOS_ROOT : primaryRepoUrl ? REPO_PATH : WORKDIR;

  const systemPrompt = buildOpencodeSystemPrompt(config.instructions, args.spaceName, {
    enabledTools: config.enabledTools,
    connectedToolkits: config.enabledConnections,
    hasComposioApiKey: Boolean(args.providerConfig.composioApiKey),
    autoApproveReadOnlyComposio: config.autoApproveReadOnlyComposio,
    spaceMemorySnapshot,
  });
  let prompt = buildOpencodeUserPrompt(messages);

  if (args.continuation) {
    const cont = args.continuation;
    const continuationText =
      cont.kind === "approved_tool"
        ? `[Approved action completed]\nTool: ${cont.toolName}\nInput: ${JSON.stringify(cont.toolInput).slice(0, 500)}\nResult:\n${formatToolResultForUser(cont.toolOutput, cont.uiCard)}\n\nContinue the original task using this approved result. Summarize the outcome clearly for the user in Slack.`
        : `[Human answered a question]\nQuestion: ${cont.questionText}\nAnswer: ${cont.answer}\n\nContinue the original task using this answer. Respond to the user in Slack.`;
    prompt = `${prompt}\n\n---\n${continuationText}`;
  }

  if (multiRepo) {
    const repoList = repoUrls
      .map((url, i) => `  ${i + 1}. ${url} -> /home/user/repos/${url.match(/[^/]+\/[^/.]+(?:\.git)?\/?$/)?.[0]?.replace(/\.git\/?$/, "").replace(/[^a-zA-Z0-9_-]/g, "-") ?? `repo-${i}`}`)
      .join("\n");
    prompt = `${prompt}\n\n# Repositories\nThe following repos are checked out in the sandbox:\n${repoList}\nUse the appropriate repo path for the task.`;
  }

  const mcpServers: Record<string, TagsMcpServerConfig> = {};

  const tagsMcpToken = buildTagsMcpRunToken(
    {
      runId: args.runId,
      organizationId: args.organizationId,
      workspaceId: args.workspaceId,
      spaceId: args.spaceId,
      channelId: args.channelId,
      threadId: args.threadId,
      actorSlackUserId: args.actorSlackUserId,
      enabledTools: config.enabledTools,
    },
    args.providerConfig.mcpSigningKey ?? "",
  );
  if (tagsMcpToken) {
    mcpServers.tags = createTagsMcpServerConfig({
      appUrl: args.appUrl,
      token: tagsMcpToken,
    });
  }

  let composioMcp: ComposioMcpServerConfig | null = null;
  try {
    const composioToken = buildComposioMcpRunToken(
      {
        runId: args.runId,
        organizationId: args.organizationId,
        workspaceId: args.workspaceId,
        spaceId: args.spaceId,
        channelId: args.channelId,
        threadId: args.threadId,
        actorSlackUserId: args.actorSlackUserId,
        enabledTools: config.enabledTools,
        enabledConnections: config.enabledConnections,
        autoApproveReadOnlyComposio: config.autoApproveReadOnlyComposio,
      },
      args.providerConfig.mcpSigningKey ?? "",
    );
    if (composioToken) {
      composioMcp = createComposioMcpProxyConfig({
        appUrl: args.appUrl,
        token: composioToken,
      });
    }
  } catch (error) {
    await emit({
      type: "status",
      label: "Composio tools unavailable",
      detail: error instanceof Error ? error.message : "Failed to create MCP proxy config",
    });
  }
  if (composioMcp) {
    mcpServers.composio = composioMcp;
  }
  const sandboxSession = await getOrCreateSpaceSandboxSession(args.db, {
    organizationId: args.organizationId,
    spaceId: args.spaceId,
    template: args.providerConfig.e2bOpencodeTemplate ?? DEFAULT_OPENCODE_TEMPLATE,
    repoUrl: primaryRepoUrl,
    workdir,
  });
  const sandboxLease = await acquireSpaceSandboxLease(args.db, {
    spaceId: args.spaceId,
    runId: args.runId,
  });

  if (!sandboxLease) {
    const message =
      "The channel sandbox is busy with another coding run. Try again when it finishes.";
    await emit({ type: "status", label: "Channel sandbox busy", detail: message });
    await updateRunStatus(args.db, args.runId, "cancelled", { finishedAt: new Date() });
    await stream.finalize(message, buildRunLinkBlock(args.appUrl, args.runId));
    return { kind: "failed", text: message };
  }

  await emit({ type: "status", label: "Starting opencode agent in sandbox" });
  await emit({
    type: "tool.started",
    toolName: "opencode",
    inputPreview: {
      promptLength: prompt.length,
      systemPromptLength: systemPrompt.length,
      sandboxSessionId: sandboxSession.id,
    },
  });

  let releaseStatus: SpaceSandboxStatus = "ready";

  try {
    const result = await providers.sandbox.runCodingAgent({
      prompt,
      systemPrompt,
      model: TAGS_MODEL_ID,
      ...(multiRepo
        ? { repoUrls }
        : { repoUrl: primaryRepoUrl ?? undefined }),
      session: {
        sandboxId: sandboxLease.externalSandboxId,
        keepAlive: true,
      },
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      // Raw opencode stdout is TUI noise (banner, "build · model" header) —
      // keep it in the run timeline (DB) but never stream it into Slack.
      onOutput: async (chunk) => {
        await appendRunEvent(args.db, args.runId, { type: "text.delta", text: chunk });
      },
    });
    await recordSpaceSandboxExternalId(args.db, {
      sessionId: sandboxSession.id,
      externalSandboxId: result.sandboxId,
      metadata: {
        createdSandbox: result.createdSandbox,
        reusedSandbox: result.reusedSandbox,
        runId: args.runId,
        ...(result.repoPaths ? { repoPaths: result.repoPaths } : {}),
      },
    });

    // Detect HITL pauses initiated by MCP tools (ask_user, approval gate).
    // The MCP handler emits the event to the DB and returns a pause response
    // to opencode. After opencode finishes, we check for pending pauses and
    // surface them to Slack + return the pause result to the Inngest workflow.
    const pendingApproval = await getPendingApprovalByRunId(args.db, args.runId);
    if (pendingApproval) {
      await emit({
        type: "approval.requested",
        approvalId: pendingApproval.id,
        requestId: pendingApproval.requestId,
        toolName: pendingApproval.toolName,
        riskLevel: pendingApproval.riskLevel,
        requestText: pendingApproval.requestText,
        inputPreview: pendingApproval.toolInput,
        requestedBySlackUserId: pendingApproval.requestedBySlackUserId ?? undefined,
        expiresAt: pendingApproval.expiresAt.toISOString(),
      });
      await updateRunStatus(args.db, args.runId, "waiting");
      return {
        kind: "approval_required",
        requestId: pendingApproval.requestId,
        approvalId: pendingApproval.id,
        toolName: pendingApproval.toolName,
        toolInput: pendingApproval.toolInput,
        invocationId: pendingApproval.toolInvocationId,
      };
    }

    const pendingQuestion = await getPendingQuestionByRunId(args.db, args.runId);
    if (pendingQuestion) {
      await emit({
        type: "question.requested",
        questionId: pendingQuestion.id,
        requestId: pendingQuestion.requestId,
        questionText: pendingQuestion.questionText,
        expiresAt: pendingQuestion.expiresAt.toISOString(),
      });
      await updateRunStatus(args.db, args.runId, "waiting");
      return {
        kind: "question_required",
        requestId: pendingQuestion.requestId,
        questionId: pendingQuestion.id,
        questionText: pendingQuestion.questionText,
        invocationId: pendingQuestion.toolInvocationId,
      };
    }

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
        sandboxSessionId: sandboxSession.id,
        sandboxId: result.sandboxId,
        createdSandbox: result.createdSandbox,
        reusedSandbox: result.reusedSandbox,
        exitCode: result.exitCode,
        output: result.output.slice(0, 12_000),
        runOutput: result.runOutput,
      },
      uiCard,
    });

    const replyText =
      result.replyText ||
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
      modelId: TAGS_MODEL_ID,
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
      storage: providers.r2,
    });

    return {
      kind: "complete",
      text: replyText,
      ...(result.runOutput ? { runOutput: result.runOutput } : {}),
    };
  } catch (error) {
    releaseStatus = "failed";
    const message = error instanceof Error ? error.message : "Unknown error";
    await emit({ type: "run.failed", error: message });
    await updateRunStatus(args.db, args.runId, "failed", {
      error: { code: "opencode_error", message },
      finishedAt: new Date(),
    });
    await stream.finalize(`Run failed: ${message}`);
    throw error;
  } finally {
    await releaseSpaceSandboxLease(args.db, {
      spaceId: args.spaceId,
      runId: args.runId,
      status: releaseStatus,
    });
  }
}
