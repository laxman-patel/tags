import { createFireworks } from "@ai-sdk/fireworks";
import { tool, isStepCount, streamText } from "ai";
import type { TagsEvent } from "@tags/core/events";
import { formatToolResultForUser } from "@tags/core/ui-cards";
import type { UICard } from "@tags/core/ui-cards";
import { checkSpaceBudget } from "@tags/core/policies";
import {
  appendRunEvent,
  createToolInvocation,
  completeToolInvocation,
  updateRunStatus,
} from "@tags/core/runs";
import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { recordUsage } from "@tags/core/usage";
import type { Db } from "@tags/db";
import { SlackStreamAdapter, buildRunLinkBlock, updateMessage } from "@tags/slack";
import { ApprovalPauseError, QuestionPauseError, type AgentSegmentResult } from "./types";
import { buildSystemPrompt, reasoningEffortFor } from "./prompt";
import { buildThreadContext } from "../context/builder";
import { maybeExtractMemories, maybeSummarizeThread } from "../context/post-run";
import { createRuntimeProviders, type RuntimeProviderConfig } from "../providers";
import { loadComposioTools, type ComposioToolsHandle } from "../tools/composio";
import { wrapComposioToolsWithApproval } from "../tools/composio-governance";
import { gateSideEffectingTool, isApprovedToolMatch } from "../tools/approval-gate";
import { resolveTools, type ToolRegistryOptions } from "../tools/registry";
import { toolIdempotencyKey, type TagsTool, type ToolContext } from "../tools/types";

export type AgentLoopArgs = {
  db: Db;
  slack: import("@slack/web-api").WebClient;
  fireworksApiKey: string;
  runId: string;
  spaceId: string;
  workspaceId: string;
  threadId: string;
  organizationId: string;
  channelId: string;
  threadTs: string;
  slackMessageTs: string;
  triggerText: string;
  actorUserId: string | null;
  spaceName: string;
  appUrl: string;
  providerConfig: RuntimeProviderConfig;
  /** When set, allows executing exactly one gated tool matched by name and input. */
  approvedTool?: {
    requestId: string;
    toolName: string;
    idempotencyKey: string;
  };
  /** After an approved side effect, inject tool output so the agent can reply naturally. */
  approvedToolContinuation?: {
    toolName: string;
    toolInput: unknown;
    toolOutput: unknown;
    uiCard?: UICard;
  };
};

export async function runAgentSegment(args: AgentLoopArgs): Promise<AgentSegmentResult> {
  const config = await loadActiveSpaceConfig(args.db, args.spaceId);
  if (!config) {
    throw new Error(`No active space config for space ${args.spaceId}`);
  }

  const fireworks = createFireworks({ apiKey: args.fireworksApiKey });
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

  const providers = await createRuntimeProviders(args.providerConfig);
  const toolOptions: ToolRegistryOptions = { appUrl: args.appUrl, ...providers };

  await updateRunStatus(args.db, args.runId, "streaming");
  await emit({ type: "status", label: "Reading thread context" });

  const messages = await buildThreadContext(args.db, args.threadId, args.spaceId, args.triggerText);

  if (args.approvedToolContinuation) {
    const cont = args.approvedToolContinuation;
    const resultText = formatToolResultForUser(cont.toolOutput, cont.uiCard);
    messages.push({
      role: "user",
      content: `[Approved action completed]\nTool: ${cont.toolName}\nResult:\n${resultText}\n\nSummarize this outcome clearly for the user in Slack.`,
    });
  }

  const tagsTools = resolveTools(args.db, config.enabledTools, toolOptions);
  const aiTools = buildAiTools(tagsTools, args, toolOptions, emit);

  let composio: ComposioToolsHandle | null = null;
  // Composio MCP bypasses native TagsTool machinery; only load in orchestrator mode
  // and wrap every tool with the shared approval gate (see composio-governance.ts).
  if (
    config.runtimeMode === "orchestrator" &&
    args.providerConfig.composioApiKey &&
    config.enabledConnections.length > 0
  ) {
    try {
      const loaded = await loadComposioTools({
        apiKey: args.providerConfig.composioApiKey,
        entityId: args.spaceId,
        toolkits: config.enabledConnections,
      });
      if (loaded) {
        composio = {
          tools: wrapComposioToolsWithApproval(loaded.tools, {
            db: args.db,
            args,
            emit,
          }),
          close: loaded.close,
        };
      }
    } catch (composioError) {
      await emit({
        type: "status",
        label: "Composio tools unavailable",
        detail:
          composioError instanceof Error ? composioError.message : "Failed to load Composio tools",
      });
    }
  }

  const tools = {
    ...aiTools,
    ...(composio?.tools ?? {}),
  } as Parameters<typeof streamText>[0]["tools"];

  // Native TagsTools emit their own tool.started/finished events (with approval,
  // idempotency, and audit) inside buildAiTools. Wrapped Composio tools emit via
  // composio-governance.ts; streamText callbacks are not used for either set.
  const instructions = buildSystemPrompt(config.instructions, args.spaceName);

  try {
    const result = streamText({
      model: fireworks(config.modelId),
      instructions,
      messages,
      tools,
      stopWhen: isStepCount(config.maxSteps),
      reasoning: reasoningEffortFor(config.reasoning),
      onChunk: async ({ chunk }) => {
        if (chunk.type === "text-delta") {
          await emit({ type: "text.delta", text: chunk.text });
        }
      },
    });

    let fullText = "";
    for await (const part of result.textStream) {
      fullText += part;
    }

    const usage = await result.usage;

    await stream.finalize(fullText || "Done.");
    await updateMessage(
      args.slack,
      args.channelId,
      args.slackMessageTs,
      fullText || "Done.",
      [...buildRunLinkBlock(args.appUrl, args.runId)],
    );
    await emit({ type: "run.finished" });
    await updateRunStatus(args.db, args.runId, "done", {
      tokenUsage: {
        prompt: usage?.inputTokens ?? 0,
        completion: usage?.outputTokens ?? 0,
        total: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
      },
      finishedAt: new Date(),
    });

    await recordUsage(args.db, {
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      runId: args.runId,
      modelId: config.modelId,
      promptTokens: usage?.inputTokens ?? 0,
      completionTokens: usage?.outputTokens ?? 0,
    });

    await maybeSummarizeThread(args.db, {
      threadId: args.threadId,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      fireworksApiKey: args.fireworksApiKey,
    });
    await maybeExtractMemories(args.db, {
      threadId: args.threadId,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      fireworksApiKey: args.fireworksApiKey,
    });

    return { kind: "complete", text: fullText };
  } catch (error) {
    if (error instanceof ApprovalPauseError) {
      await updateRunStatus(args.db, args.runId, "waiting");
      return {
        kind: "approval_required",
        ...error.payload,
      };
    }

    if (error instanceof QuestionPauseError) {
      await updateRunStatus(args.db, args.runId, "waiting");
      return {
        kind: "question_required",
        ...error.payload,
      };
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    await emit({ type: "run.failed", error: message });
    await updateRunStatus(args.db, args.runId, "failed", {
      error: { code: "agent_error", message },
      finishedAt: new Date(),
    });
    throw error;
  } finally {
    if (composio) {
      await composio.close();
    }
  }
}

export async function executeApprovedTool(
  db: Db,
  args: {
    runId: string;
    organizationId: string;
    workspaceId: string;
    spaceId: string;
    threadId: string;
    actorUserId: string | null;
    appUrl: string;
    toolOptions: ToolRegistryOptions;
    toolName: string;
    toolInput: unknown;
    invocationId: string;
    emit: (event: TagsEvent) => Promise<void>;
  },
): Promise<{ modelOutput: unknown; uiCard?: UICard }> {
  const tagsTool = resolveTools(db, [args.toolName], args.toolOptions)[0];
  if (!tagsTool) {
    throw new Error(`Tool not found: ${args.toolName}`);
  }

  const toolCtx = buildToolContext(args, args.toolOptions, args.emit);

  const toolResult = await tagsTool.execute(args.toolInput, toolCtx);

  await completeToolInvocation(db, args.invocationId, {
    status: "succeeded",
    result: toolResult.modelOutput,
    externalResourceKind: toolResult.externalResource?.kind,
    externalResourceId: toolResult.externalResource?.id,
  });

  await args.emit({
    type: "tool.finished",
    toolName: args.toolName,
    outputPreview: toolResult.modelOutput,
    uiCard: toolResult.uiCard,
  });

  return { modelOutput: toolResult.modelOutput, uiCard: toolResult.uiCard };
}

export async function rejectPendingTool(
  db: Db,
  invocationId: string,
  toolName: string,
  emit: (event: TagsEvent) => Promise<void>,
): Promise<void> {
  const rejected = { rejected: true };
  await completeToolInvocation(db, invocationId, {
    status: "failed",
    result: rejected,
  });
  await emit({
    type: "tool.finished",
    toolName,
    outputPreview: rejected,
  });
}

function buildToolContext(
  args: {
    organizationId: string;
    workspaceId: string;
    spaceId: string;
    threadId: string;
    runId: string;
    actorUserId: string | null;
    appUrl: string;
  },
  toolOptions: ToolRegistryOptions,
  emit: (event: TagsEvent) => Promise<void>,
): ToolContext {
  const { appUrl: _appUrl, ...providers } = toolOptions;
  return {
    ...providers,
    organizationId: args.organizationId,
    workspaceId: args.workspaceId,
    spaceId: args.spaceId,
    threadId: args.threadId,
    runId: args.runId,
    actorUserId: args.actorUserId,
    appUrl: args.appUrl,
    emit,
  };
}

function buildAiTools(
  tools: TagsTool[],
  args: AgentLoopArgs,
  toolOptions: ToolRegistryOptions,
  emit: (event: TagsEvent) => Promise<void>,
): Record<string, ReturnType<typeof tool>> {
  const record: Record<string, ReturnType<typeof tool>> = {};

  for (const tagsTool of tools) {
    const aiTool = tool({
      description: tagsTool.description,
      inputSchema: tagsTool.inputSchema,
      execute: async (input: unknown) => {
        await emit({
          type: "tool.started",
          toolName: tagsTool.name,
          inputPreview: input,
        });

        const idempotencyKey = toolIdempotencyKey(args.runId, tagsTool.name, input);

        if (
          tagsTool.sideEffecting &&
          needsApproval(tagsTool.approval, input) &&
          !isApprovedToolMatch(args.approvedTool, tagsTool.name, idempotencyKey)
        ) {
          const gate = await gateSideEffectingTool({
            db: args.db,
            runId: args.runId,
            organizationId: args.organizationId,
            spaceId: args.spaceId,
            threadId: args.threadId,
            toolName: tagsTool.name,
            toolInput: input,
            actorUserId: args.actorUserId,
            approvedTool: args.approvedTool,
            emit,
          });
          if (gate.cachedResult !== undefined) {
            return gate.cachedResult;
          }
        }

        if (
          args.approvedTool &&
          tagsTool.sideEffecting &&
          isApprovedToolMatch(args.approvedTool, tagsTool.name, idempotencyKey)
        ) {
          const invocation = await createToolInvocation(args.db, {
            runId: args.runId,
            organizationId: args.organizationId,
            spaceId: args.spaceId,
            toolName: tagsTool.name,
            toolInput: input,
            idempotencyKey,
          });
          if (invocation.status === "succeeded" && invocation.result != null) {
            return invocation.result;
          }
          return executeApprovedTool(args.db, {
            runId: args.runId,
            organizationId: args.organizationId,
            workspaceId: args.workspaceId,
            spaceId: args.spaceId,
            threadId: args.threadId,
            actorUserId: args.actorUserId,
            appUrl: args.appUrl,
            toolOptions,
            toolName: tagsTool.name,
            toolInput: input,
            invocationId: invocation.id,
            emit,
          }).then((result) => result.modelOutput);
        }

        const toolCtx = buildToolContext(args, toolOptions, emit);

        const toolResult = await tagsTool.execute(input, toolCtx);
        const invocationIdempotencyKey = toolIdempotencyKey(args.runId, tagsTool.name, input);
        const invocation = await createToolInvocation(args.db, {
          runId: args.runId,
          organizationId: args.organizationId,
          spaceId: args.spaceId,
          toolName: tagsTool.name,
          toolInput: input,
          idempotencyKey: invocationIdempotencyKey,
        });

        await completeToolInvocation(args.db, invocation.id, {
          status: "succeeded",
          result: toolResult.modelOutput,
          externalResourceKind: toolResult.externalResource?.kind,
          externalResourceId: toolResult.externalResource?.id,
        });

        await emit({
          type: "tool.finished",
          toolName: tagsTool.name,
          outputPreview: toolResult.modelOutput,
          uiCard: toolResult.uiCard,
        });

        return toolResult.modelOutput;
      },
    });
    record[tagsTool.name] = aiTool as unknown as ReturnType<typeof tool>;
  }

  return record;
}

function needsApproval(
  policy: TagsTool["approval"],
  input: unknown,
): boolean {
  switch (policy.kind) {
    case "never":
      return false;
    case "always":
      return true;
    case "once":
      return true;
    case "predicate":
      return policy.needsApproval(input);
    default: {
      const _exhaustive: never = policy;
      return _exhaustive;
    }
  }
}
