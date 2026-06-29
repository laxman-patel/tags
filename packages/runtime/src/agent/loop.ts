import { createFireworks } from "@ai-sdk/fireworks";
import { tool, isStepCount, streamText } from "ai";
import type { TagsEvent } from "@tags/core/events";
import { checkSpaceBudget } from "@tags/core/policies";
import {
  appendRunEvent,
  createApprovalRequest,
  createToolInvocation,
  completeToolInvocation,
  updateRunStatus,
} from "@tags/core/runs";
import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { recordUsage } from "@tags/core/usage";
import type { Db } from "@tags/db";
import { newId } from "@tags/db";
import { SlackStreamAdapter } from "@tags/slack";
import { ApprovalPauseError, type AgentSegmentResult } from "./types";
import { buildSystemPrompt, reasoningEffortFor } from "./prompt";
import { buildThreadContext } from "../context/builder";
import { createRuntimeProviders, type RuntimeProviderConfig } from "../providers";
import { loadComposioTools, type ComposioToolsHandle } from "../tools/composio";
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
  /** When set, the matching approval was granted and the gated tool may execute. */
  approvedRequestId?: string;
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
    return { kind: "complete", text: message };
  }

  const providers = await createRuntimeProviders(args.providerConfig);
  const toolOptions: ToolRegistryOptions = { appUrl: args.appUrl, ...providers };

  await updateRunStatus(args.db, args.runId, "streaming");
  await emit({ type: "status", label: "Reading thread context" });

  const messages = await buildThreadContext(args.db, args.threadId, args.spaceId, args.triggerText);
  const tagsTools = resolveTools(args.db, config.enabledTools, toolOptions);
  const aiTools = buildAiTools(tagsTools, args, toolOptions, emit);

  let composio: ComposioToolsHandle | null = null;
  if (args.providerConfig.composioApiKey && config.enabledConnections.length > 0) {
    try {
      composio = await loadComposioTools({
        apiKey: args.providerConfig.composioApiKey,
        entityId: args.spaceId,
        toolkits: config.enabledConnections,
      });
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
  // idempotency, and audit) inside buildAiTools. Composio tools self-execute, so
  // we surface only those in the run timeline via the streamText callbacks below.
  const nativeToolNames = new Set(tagsTools.map((tagsTool) => tagsTool.name));

  const instructions = buildSystemPrompt(config.instructions, args.spaceName);

  try {
    const result = streamText({
      model: fireworks(config.modelId),
      instructions,
      messages,
      tools,
      stopWhen: isStepCount(config.maxSteps),
      reasoning: reasoningEffortFor(config.reasoning),
      onToolExecutionStart: async ({ toolCall }) => {
        if (!nativeToolNames.has(toolCall.toolName)) {
          await emit({
            type: "tool.started",
            toolName: toolCall.toolName,
            inputPreview: toolCall.input,
          });
        }
      },
      onToolExecutionEnd: async ({ toolCall, toolOutput }) => {
        if (!nativeToolNames.has(toolCall.toolName)) {
          await emit({
            type: "tool.finished",
            toolName: toolCall.toolName,
            outputPreview:
              toolOutput.type === "tool-result" ? toolOutput.output : { error: true },
          });
        }
      },
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
    const { buildRunLinkBlock, updateMessage } = await import("@tags/slack");
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

    return { kind: "complete", text: fullText };
  } catch (error) {
    if (error instanceof ApprovalPauseError) {
      await updateRunStatus(args.db, args.runId, "waiting");
      return {
        kind: "approval_required",
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
): Promise<unknown> {
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
  });

  return toolResult.modelOutput;
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

        if (
          tagsTool.sideEffecting &&
          needsApproval(tagsTool.approval, input) &&
          !args.approvedRequestId
        ) {
          const idempotencyKey = toolIdempotencyKey(args.runId, tagsTool.name, input);
          const invocation = await createToolInvocation(args.db, {
            runId: args.runId,
            organizationId: args.organizationId,
            spaceId: args.spaceId,
            toolName: tagsTool.name,
            toolInput: input,
            idempotencyKey,
          });

          if (invocation.status === "succeeded" && invocation.result) {
            return invocation.result;
          }

          const requestId = newId();
          const approval = await createApprovalRequest(args.db, {
            organizationId: args.organizationId,
            spaceId: args.spaceId,
            runId: args.runId,
            threadId: args.threadId,
            toolInvocationId: invocation.id,
            requestId,
            toolName: tagsTool.name,
            toolInput: input,
            riskLevel: tagsTool.risk,
            requestText: `Approve ${tagsTool.name}?`,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          });

          await emit({
            type: "approval.requested",
            approvalId: approval.id,
            requestId,
          });

          throw new ApprovalPauseError({
            requestId,
            approvalId: approval.id,
            toolName: tagsTool.name,
            toolInput: input,
            invocationId: invocation.id,
          });
        }

        if (args.approvedRequestId && tagsTool.sideEffecting) {
          const invocation = await createToolInvocation(args.db, {
            runId: args.runId,
            organizationId: args.organizationId,
            spaceId: args.spaceId,
            toolName: tagsTool.name,
            toolInput: input,
            idempotencyKey: toolIdempotencyKey(args.runId, tagsTool.name, input),
          });
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
          });
        }

        const toolCtx = buildToolContext(args, toolOptions, emit);

        const toolResult = await tagsTool.execute(input, toolCtx);
        const idempotencyKey = toolIdempotencyKey(args.runId, tagsTool.name, input);
        const invocation = await createToolInvocation(args.db, {
          runId: args.runId,
          organizationId: args.organizationId,
          spaceId: args.spaceId,
          toolName: tagsTool.name,
          toolInput: input,
          idempotencyKey,
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
