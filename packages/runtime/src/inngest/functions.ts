import { and, eq, isNull } from "drizzle-orm";
import type { InngestFunction } from "inngest";
import {
  appendRunEvent,
  completeToolInvocation,
  createRun,
  expireApprovalByRequestId,
  updateRunStatus,
} from "@tags/core/runs";
import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { findOrCreateThread, getMessageByProviderMessageId, upsertMessage } from "@tags/core/threads";
import type { TagsEvent } from "@tags/core/events";
import { createArtifact } from "@tags/core/artifacts";
import { createDb, newId, runs, threads } from "@tags/db";
import {
  addReaction,
  postThreadMessage,
  removeReaction,
  SlackStreamAdapter,
  buildRunLinkBlock,
  stopStream,
  uploadThreadFile,
  updateMessage,
} from "@tags/slack";
import { parseMemoryCommand } from "../context/builder";
import { setSentryRunContext } from "../observability/sentry";
import { syncSlackThreadToDb } from "@tags/slack/sync-thread";
import {
  addMemoryEntry,
  loadSpaceMemoryFile,
  memoryUsage,
  MemoryFullError,
  mutateSpaceMemoryFile,
  removeMemoryEntryBySubstring,
} from "@tags/core/file-memory";
import {
  artifactBinaryObjectKey,
  createR2Client,
  publicArtifactUrl,
  uploadArtifactBytes,
  type R2Storage,
} from "@tags/storage";
import {
  executeApprovedTool,
  rejectPendingTool,
} from "../agent/loop";
import type { AgentSegmentResult } from "../agent/types";
import { runOpencodeSegment, type OpencodeContinuation } from "../agent/opencode-segment";
import { createRuntimeProviders } from "../providers";
import { loadRuntimeSecrets } from "../secrets";
import { loadWorkspaceRuntime } from "./workspace-slack";
import { upsertDemoRecordingCommentWithComposio } from "../integrations/composio-github";
import { loadComposioTools } from "../tools/composio";
import type { UICard } from "@tags/core/ui-cards";
import { recordDemo, type TagsRunOutput } from "@tags/sandbox";
import { withSpan } from "@superlog/otel-helpers";
import {
  agentRunDuration,
  agentRunsCompleted,
  agentRunsStarted,
  emitInfo,
  emitWarn,
  tagsTracer,
} from "../observability/otel";
import {
  APPROVAL_RESOLVED_EVENT,
  QUESTION_ANSWERED_EVENT,
  RUN_REQUESTED_EVENT,
  inngest,
} from "./client";

const MAX_APPROVALS = 10;
const MAX_PAUSES = 10;

export type TagsRunInput = {
  organizationId: string;
  workspaceId: string;
  spaceId: string;
  spaceName: string;
  channelId: string;
  teamId: string;
  threadTs: string;
  rootMessageTs: string;
  triggerText: string;
  triggerMessageTs: string;
  actorSlackUserId: string;
  idempotencyKey: string;
  appUrl: string;
  trigger: "mention" | "reply" | "schedule" | "approval_response";
  isScheduled?: boolean;
  /** ts of the "Tags is working…" placeholder if the webhook already posted it. */
  placeholderMessageTs?: string;
  /** True when the placeholder is a native Slack stream (chat.startStream). */
  placeholderIsStream?: boolean;
};

type RunSetup = {
  runId: string;
  threadId: string;
  slackMessageTs: string;
  /** Whether slackMessageTs is a native Slack stream (append/stop) vs a plain message (update). */
  slackStream: boolean;
  threadTs: string;
  skipped?: boolean;
};

export const tagsRunFunction: InngestFunction.Any = inngest.createFunction(
  { id: "tags-run", retries: 2, triggers: [{ event: RUN_REQUESTED_EVENT }] },
  async ({ event, step }) => {
    const input = event.data as TagsRunInput;
    const startedAt = Date.now();
    agentRunsStarted.add(1, { trigger: input.trigger, "space.id": input.spaceId });

    const setup = (await step.run("ingest", () => ingestStep(input))) as RunSetup;

    if (setup.skipped) {
      return { runId: setup.runId, skipped: true };
    }

    let threadStatus: "done" | "failed" = "done";

    try {
      let segmentIndex = 0;
      let segment = (await step.run(`agent-segment-${segmentIndex}`, () =>
        agentSegmentStep(input, setup),
      )) as AgentSegmentResult;

      if (segment.kind !== "failed") {
        while (segmentIndex < MAX_PAUSES) {
          if (segment.kind === "failed") {
            threadStatus = "failed";
            break;
          }

          if (segment.kind === "approval_required") {
            const pendingApproval = segment;

            const resolved = await step.waitForEvent(`await-approval-${segmentIndex}`, {
              event: APPROVAL_RESOLVED_EVENT,
              timeout: "1h",
              if: `async.data.requestId == "${pendingApproval.requestId}"`,
            });

            const approved = resolved?.data?.decision === "approved";

            if (approved) {
              const toolResult = (await step.run(`execute-approved-${segmentIndex}`, () =>
                executeApprovedToolStep(input, setup, pendingApproval),
              )) as { modelOutput: unknown; uiCard?: UICard };

              segmentIndex += 1;
              segment = (await step.run(`resume-after-approval-${segmentIndex}`, () =>
                resumeAfterApprovalStep(input, setup, pendingApproval, toolResult),
              )) as AgentSegmentResult;
            } else {
              if (!resolved) {
                await step.run(`expire-approval-${segmentIndex}`, () =>
                  expireApprovalStep(pendingApproval.requestId),
                );
              }
              await step.run(`reject-tool-${segmentIndex}`, () =>
                rejectToolStep({
                  runId: setup.runId,
                  invocationId: pendingApproval.invocationId,
                  toolName: pendingApproval.toolName,
                }),
              );
              await step.run(`finalize-rejected-${segmentIndex}`, () =>
                finalizeRunStep({
                  runId: setup.runId,
                  workspaceId: input.workspaceId,
                  channelId: input.channelId,
                  slackMessageTs: setup.slackMessageTs,
                  slackStream: setup.slackStream,
                  summaryText: resolved
                    ? `Rejected ${pendingApproval.toolName}.`
                    : `Approval for ${pendingApproval.toolName} timed out.`,
                  appUrl: input.appUrl,
                }),
              );
              threadStatus = "failed";
              break;
            }
            continue;
          }

          if (segment.kind === "question_required") {
            const pendingQuestion = segment;

            const answered = await step.waitForEvent(`await-question-${segmentIndex}`, {
              event: QUESTION_ANSWERED_EVENT,
              timeout: "1h",
              if: `async.data.requestId == "${pendingQuestion.requestId}"`,
            });

            if (answered?.data?.answer) {
              await step.run(`complete-question-${segmentIndex}`, () =>
                completeQuestionStep(setup.runId, pendingQuestion, answered.data.answer as string),
              );

              segmentIndex += 1;
              segment = (await step.run(`resume-after-question-${segmentIndex}`, () =>
                resumeAfterQuestionStep(input, setup, pendingQuestion, answered.data.answer as string),
              )) as AgentSegmentResult;
            } else {
              await step.run(`expire-question-${segmentIndex}`, () =>
                expireQuestionStep(pendingQuestion.requestId),
              );
              await step.run(`reject-question-tool-${segmentIndex}`, () =>
                rejectToolStep({
                  runId: setup.runId,
                  invocationId: pendingQuestion.invocationId,
                  toolName: "ask_user",
                }),
              );
              await step.run(`finalize-question-timeout-${segmentIndex}`, () =>
                finalizeRunStep({
                  runId: setup.runId,
                  workspaceId: input.workspaceId,
                  channelId: input.channelId,
                  slackMessageTs: setup.slackMessageTs,
                  slackStream: setup.slackStream,
                  summaryText: "Question timed out without an answer.",
                  appUrl: input.appUrl,
                }),
              );
              threadStatus = "failed";
              break;
            }
            continue;
          }

          break;
        }

        if (segment.kind === "failed") {
          threadStatus = "failed";
        } else if (segment.kind === "approval_required" || segment.kind === "question_required") {
          threadStatus = "failed";
        }
      } else {
        threadStatus = "failed";
      }

      if (threadStatus === "done" && segment.kind === "complete") {
        await step.run("record-demo", () => recordDemoStep(input, setup, segment.runOutput));
      }
    } catch (error) {
      threadStatus = "failed";
      throw error;
    } finally {
      await step.run("release-thread", () =>
        releaseThreadStep(setup.threadId, setup.runId, threadStatus),
      );
      if (!input.isScheduled) {
        await step.run("finalize-reaction", () =>
          finalizeReactionStep(input.workspaceId, input.channelId, input.triggerMessageTs, threadStatus),
        );
      }
      const durationMs = Date.now() - startedAt;
      agentRunsCompleted.add(1, {
        trigger: input.trigger,
        outcome: threadStatus,
        "space.id": input.spaceId,
      });
      agentRunDuration.record(durationMs, {
        trigger: input.trigger,
        outcome: threadStatus,
        "space.id": input.spaceId,
      });
      emitInfo("agent run finished", {
        "organization.id": input.organizationId,
        "workspace.id": input.workspaceId,
        "space.id": input.spaceId,
        "run.id": setup.runId,
        trigger: input.trigger,
        outcome: threadStatus,
        "duration.ms": durationMs,
      });
    }

    return { runId: setup.runId };
  },
);

async function ingestStep(input: TagsRunInput): Promise<RunSetup> {
  return await withSpan(
    "agent.run_ingest",
    async (span) => {
      span.setAttributes({
        "organization.id": input.organizationId,
        "workspace.id": input.workspaceId,
        "space.id": input.spaceId,
        "slack.channel.id": input.channelId,
        "slack.team.id": input.teamId,
        trigger: input.trigger,
        "run.scheduled": Boolean(input.isScheduled),
      });

  const { secrets, db, slack } = await loadWorkspaceRuntime(input.workspaceId);
  const config = await loadActiveSpaceConfig(db, input.spaceId);

  if (!config) {
    throw new Error(`No active config for space ${input.spaceId}`);
  }

  let threadTs = input.threadTs;
  let rootMessageTs = input.rootMessageTs;
  let triggerMessageTs = input.triggerMessageTs;

  if (input.isScheduled) {
    const preview =
      input.triggerText.length > 120
        ? `${input.triggerText.slice(0, 117)}…`
        : input.triggerText;
    const root = await postThreadMessage(
      slack,
      input.channelId,
      undefined,
      `Scheduled task: ${preview}`,
    );
    threadTs = root.messageTs;
    rootMessageTs = root.messageTs;
    triggerMessageTs = root.messageTs;
  }

  const thread = await findOrCreateThread(db, {
    organizationId: input.organizationId,
    spaceId: input.spaceId,
    providerThreadId: threadTs,
    rootMessageId: rootMessageTs,
  });

  const memoryCommandResult = await executeDeterministicMemoryCommand(
    db,
    secrets.r2 ? { client: createR2Client(secrets.r2), config: secrets.r2 } : undefined,
    input,
    thread.id,
  );

  let triggerMessageId: string | undefined;

  if (!input.isScheduled) {
    // Sync first so the trigger message is stored with any file attachments
    // inlined; the explicit upsert below is a fallback (no-op if synced).
    await syncSlackThreadToDb(slack, db, {
      organizationId: input.organizationId,
      spaceId: input.spaceId,
      threadId: thread.id,
      channelId: input.channelId,
      threadTs,
    });

    await upsertMessage(db, {
      organizationId: input.organizationId,
      spaceId: input.spaceId,
      threadId: thread.id,
      providerMessageId: triggerMessageTs,
      authorType: "human",
      authorId: input.actorSlackUserId,
      text: input.triggerText,
    });
  } else {
    // Persist the scheduled prompt as a system message so thread search,
    // audit, replay, and summarization can see it.
    await upsertMessage(db, {
      organizationId: input.organizationId,
      spaceId: input.spaceId,
      threadId: thread.id,
      providerMessageId: triggerMessageTs,
      authorType: "system",
      authorId: "schedule",
      text: input.triggerText,
      metadata: { scheduled: true },
    });
  }

  triggerMessageId = (await getMessageByProviderMessageId(db, thread.id, triggerMessageTs))?.id;

  if (memoryCommandResult) {
    await upsertMessage(db, {
      organizationId: input.organizationId,
      spaceId: input.spaceId,
      threadId: thread.id,
      providerMessageId: `memory-command:${triggerMessageTs}`,
      authorType: "system",
      authorId: "tags",
      text: `[Memory command result]\n${memoryCommandResult}`,
    });
  }

  const run =
    (await createRun(db, {
      organizationId: input.organizationId,
      spaceId: input.spaceId,
      threadId: thread.id,
      spaceConfigVersion: config.version,
      modelId: config.modelId,
      trigger: input.trigger,
      idempotencyKey: input.idempotencyKey,
      inputMessageId: triggerMessageId,
    })) ??
    (
      await db.select().from(runs).where(eq(runs.idempotencyKey, input.idempotencyKey)).limit(1)
    )[0];

  if (!run) {
    throw new Error("Failed to create or find run");
  }

  const claimed = await db
    .update(threads)
    .set({ activeRunId: run.id, status: "running", updatedAt: new Date() })
    .where(and(eq(threads.id, thread.id), isNull(threads.activeRunId)))
    .returning();

  if (!claimed[0]) {
    await updateRunStatus(db, run.id, "cancelled", { finishedAt: new Date() });
    const busyText = "Still working on the previous request in this thread.";
    if (input.placeholderMessageTs && input.placeholderIsStream) {
      await stopStream(slack, input.channelId, input.placeholderMessageTs, {
        chunks: [{ type: "markdown_text", text: busyText }],
      }).catch(() => {});
    } else if (input.placeholderMessageTs) {
      await updateMessage(slack, input.channelId, input.placeholderMessageTs, busyText);
    } else {
      await postThreadMessage(slack, input.channelId, threadTs, busyText);
    }
    if (!input.isScheduled) {
      await removeReaction(slack, input.channelId, input.triggerMessageTs, "eyes").catch(() => {});
    }
    span.setAttributes({
      "run.id": run.id,
      "thread.id": thread.id,
      outcome: "skipped",
    });
    emitInfo("agent run skipped because thread is busy", {
      "space.id": input.spaceId,
      "run.id": run.id,
      "thread.id": thread.id,
      outcome: "skipped",
    });
    return {
      runId: run.id,
      threadId: thread.id,
      slackMessageTs: "",
      slackStream: false,
      threadTs,
      skipped: true,
    };
  }

  const slackRef = input.placeholderMessageTs
    ? { channelId: input.channelId, messageTs: input.placeholderMessageTs }
    : await postThreadMessage(slack, input.channelId, threadTs, "Tags is working…");
  const slackStream = Boolean(input.placeholderMessageTs && input.placeholderIsStream);

  setSentryRunContext({
    organizationId: input.organizationId,
    spaceId: input.spaceId,
    runId: run.id,
  });

  span.setAttributes({
    "run.id": run.id,
    "thread.id": thread.id,
    outcome: "success",
  });
  emitInfo("agent run ingested", {
    "space.id": input.spaceId,
    "run.id": run.id,
    "thread.id": thread.id,
    trigger: input.trigger,
    outcome: "success",
  });
  return {
    runId: run.id,
    threadId: thread.id,
    slackMessageTs: slackRef.messageTs,
    slackStream,
    threadTs,
  };
    },
    { tracer: tagsTracer },
  );
}

async function recordDemoStep(
  input: TagsRunInput,
  setup: RunSetup,
  runOutput: TagsRunOutput | undefined,
): Promise<void> {
  return await withSpan(
    "demo.record",
    async (span) => {
      span.setAttributes({
        "organization.id": input.organizationId,
        "workspace.id": input.workspaceId,
        "space.id": input.spaceId,
        "thread.id": setup.threadId,
        "run.id": setup.runId,
      });

  const { secrets, db, slack } = await loadWorkspaceRuntime(input.workspaceId);
  if (!secrets.demoRecording.enabled) return;
  const emit = async (event: TagsEvent) => {
    await appendRunEvent(db, setup.runId, event);
  };

  const config = await loadActiveSpaceConfig(db, input.spaceId);
  const repoUrl = runOutput?.repoUrl ?? config?.repoUrls?.[0] ?? config?.repoUrl ?? undefined;
  const prUrl = runOutput?.prUrl;
  const demo = runOutput?.demo;

  if (!prUrl || !repoUrl || !demo || demo.kind === "none") {
    return;
  }

  if (!secrets.e2bApiKey || !secrets.composioApiKey || !secrets.r2?.publicBaseUrl) {
    const message =
      "Demo recording is enabled but E2B_API_KEY, COMPOSIO_API_KEY, or R2_PUBLIC_BASE_URL is missing.";
    await emit({ type: "recording.failed", prUrl, error: message });
    await postThreadMessage(slack, input.channelId, setup.threadTs, `Demo recording skipped: ${message}`);
    return;
  }

  if (!config?.enabledConnections.includes("github")) {
    const message = "Demo recording PR comments require the Space GitHub connection to be enabled.";
    await emit({ type: "recording.failed", prUrl, error: message });
    await postThreadMessage(slack, input.channelId, setup.threadTs, `Demo recording skipped: ${message}`);
    return;
  }

  await emit({ type: "recording.started", prUrl, demoKind: demo.kind });

  try {
    const recording = await recordDemo({
      apiKey: secrets.e2bApiKey,
      template: secrets.e2bDemoTemplate,
      repoUrl,
      branch: runOutput?.branch,
      demo,
      maxSeconds: secrets.demoRecording.maxSeconds,
      width: secrets.demoRecording.width,
      height: secrets.demoRecording.height,
      fps: secrets.demoRecording.fps,
    });

    const r2Client = createR2Client(secrets.r2);
    const artifactId = newId();
    const key = artifactBinaryObjectKey(input.organizationId, artifactId, recording.filename);
    await uploadArtifactBytes(r2Client, secrets.r2, key, recording.video, recording.contentType);
    const artifactUrl = publicArtifactUrl(secrets.r2, key);
    if (!artifactUrl) throw new Error("R2_PUBLIC_BASE_URL is not configured");

    const slackFile = await uploadThreadFile(slack, {
      channelId: input.channelId,
      threadTs: setup.threadTs,
      file: recording.video,
      filename: recording.filename,
      title: "Tags demo recording",
      initialComment: `Demo recording for ${prUrl}\n${artifactUrl}`,
    });

    let prComment: { htmlUrl?: string } = {};
    const composio = await loadComposioTools({
      apiKey: secrets.composioApiKey,
      entityId: input.spaceId,
      toolkits: ["github"],
    });
    if (!composio) {
      throw new Error("Composio GitHub tools are unavailable");
    }
    try {
      prComment = await upsertDemoRecordingCommentWithComposio({
        tools: composio.tools,
        prUrl,
        runId: setup.runId,
        artifactUrl,
        appUrl: input.appUrl,
        slackPermalink: slackFile.permalink,
      });
    } finally {
      await composio.close();
    }

    const artifact = await createArtifact(db, {
      id: artifactId,
      organizationId: input.organizationId,
      spaceId: input.spaceId,
      threadId: setup.threadId,
      runId: setup.runId,
      kind: "video",
      title: "Demo recording",
      url: artifactUrl,
      contentRef: key,
      contentType: recording.contentType,
      sizeBytes: recording.video.byteLength,
      metadata: {
        prUrl,
        repoUrl,
        branch: runOutput?.branch,
        durationMs: recording.durationMs,
        slackFileId: slackFile.fileId,
        slackPermalink: slackFile.permalink,
        prCommentUrl: prComment.htmlUrl,
      },
    });
    if (!artifact) throw new Error("Failed to create demo recording artifact");

    await emit({
      type: "artifact.created",
      artifactId,
      artifactUrl,
      artifactTitle: "Demo recording",
    });
    await emit({
      type: "recording.finished",
      artifactId,
      artifactUrl,
      prUrl,
      slackFileId: slackFile.fileId,
      prCommentUrl: prComment.htmlUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Demo recording failed";
    await emit({ type: "recording.failed", prUrl, error: message });
    emitWarn("demo recording failed", {
      "space.id": input.spaceId,
      "run.id": setup.runId,
      outcome: "error",
      "error.type": error instanceof Error ? error.name : typeof error,
    });
    await postThreadMessage(slack, input.channelId, setup.threadTs, `Demo recording failed for ${prUrl}: ${message}`);
  }
    },
    { tracer: tagsTracer },
  );
}

async function executeDeterministicMemoryCommand(
  db: ReturnType<typeof createDb>,
  storage: R2Storage | undefined,
  input: TagsRunInput,
  threadId: string,
): Promise<string | null> {
  const command = parseMemoryCommand(input.triggerText);
  if (!command) return null;
  if (!storage) return "R2 memory storage is not configured.";

  const context = {
    db,
    organizationId: input.organizationId,
    spaceId: input.spaceId,
    actorType: "human" as const,
    sourceThreadId: threadId,
  };

  try {
    switch (command.action) {
      case "add": {
        const result = await mutateSpaceMemoryFile(storage, context, (memory) =>
          addMemoryEntry(memory, command.content),
        );
        const usage = memoryUsage(result.memory);
        return result.duplicate
          ? `That memory already exists. Usage: ${usage.used}/${usage.limit} chars.`
          : `Saved to Space memory. Usage: ${usage.used}/${usage.limit} chars.`;
      }
      case "remove": {
        const result = await mutateSpaceMemoryFile(storage, context, (memory) =>
          removeMemoryEntryBySubstring(memory, command.oldText),
        );
        const usage = memoryUsage(result.memory);
        return `Removed matching memory. Usage: ${usage.used}/${usage.limit} chars.`;
      }
      case "show": {
        const memory = await loadSpaceMemoryFile(storage, {
          organizationId: input.organizationId,
          spaceId: input.spaceId,
        });
        const usage = memoryUsage(memory);
        return `Space memory (${usage.used}/${usage.limit} chars):\n${
          memory.entries.map((entry) => `- ${entry.content}`).join("\n") || "(no entries)"
        }`;
      }
      default: {
        const _exhaustive: never = command;
        return _exhaustive;
      }
    }
  } catch (error) {
    if (error instanceof MemoryFullError) {
      return `${error.message}\n\nCurrent entries:\n${error.entries
        .map((entry) => `- ${entry.content}`)
        .join("\n")}`;
    }
    return error instanceof Error ? error.message : "Memory command failed.";
  }
}

async function agentSegmentStep(input: TagsRunInput, setup: RunSetup) {
  const { db, slack, providerConfig } = await loadWorkspaceRuntime(input.workspaceId);

  return runOpencodeSegment({
    db,
    slack,
    runId: setup.runId,
    spaceId: input.spaceId,
    workspaceId: input.workspaceId,
    threadId: setup.threadId,
    organizationId: input.organizationId,
    channelId: input.channelId,
    slackMessageTs: setup.slackMessageTs,
    slackStream: setup.slackStream,
    triggerText: input.triggerText,
    actorSlackUserId: input.actorSlackUserId,
    spaceName: input.spaceName,
    appUrl: input.appUrl,
    providerConfig,
  });
}

async function executeApprovedToolStep(
  input: TagsRunInput,
  setup: RunSetup,
  segment: { invocationId: string; toolName: string; toolInput: unknown },
) {
  const { secrets, db, slack, providerConfig } = await loadWorkspaceRuntime(input.workspaceId);
  const stream = new SlackStreamAdapter(slack, input.channelId, setup.slackMessageTs, {
    native: setup.slackStream,
  });
  const emit = async (event: TagsEvent) => {
    await appendRunEvent(db, setup.runId, event);
    await stream.pushEvent(event);
  };

  if (segment.toolName.startsWith("composio.")) {
    const config = await loadActiveSpaceConfig(db, input.spaceId);
    if (!config) {
      throw new Error(`No active config for space ${input.spaceId}`);
    }

    const composio = await loadComposioTools({
      apiKey: secrets.composioApiKey ?? "",
      entityId: input.spaceId,
      toolkits: config.enabledConnections,
    });

    if (!composio) {
      throw new Error(`Composio tools unavailable for ${segment.toolName}`);
    }

    try {
      const rawName = segment.toolName.slice("composio.".length);
      const composioTool = composio.tools[rawName] as
        | { execute?: (toolInput: unknown, options: unknown) => Promise<unknown> }
        | undefined;

      if (!composioTool?.execute) {
        throw new Error(`Composio tool not found: ${rawName}`);
      }

      const output = await composioTool.execute(segment.toolInput, {});

      await completeToolInvocation(db, segment.invocationId, {
        status: "succeeded",
        result: output,
      });

      await emit({
        type: "tool.finished",
        toolName: segment.toolName,
        outputPreview: output,
      });

      return { modelOutput: output };
    } finally {
      await composio.close();
    }
  }

  const providers = await createRuntimeProviders(providerConfig);
  const toolOptions = { appUrl: input.appUrl, providerConfig, ...providers };

  return executeApprovedTool(db, {
    runId: setup.runId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    spaceId: input.spaceId,
    channelId: input.channelId,
    threadId: setup.threadId,
    actorUserId: input.actorSlackUserId,
    appUrl: input.appUrl,
    toolOptions,
    toolName: segment.toolName,
    toolInput: segment.toolInput,
    invocationId: segment.invocationId,
    emit,
  });
}

async function resumeAfterApprovalStep(
  input: TagsRunInput,
  setup: RunSetup,
  segment: {
    requestId: string;
    toolName: string;
    toolInput: unknown;
  },
  toolResult: { modelOutput: unknown; uiCard?: UICard },
) {
  const { db, slack, providerConfig } = await loadWorkspaceRuntime(input.workspaceId);

  const continuation: OpencodeContinuation = {
    kind: "approved_tool",
    toolName: segment.toolName,
    toolInput: segment.toolInput,
    toolOutput: toolResult.modelOutput,
    ...(toolResult.uiCard ? { uiCard: toolResult.uiCard } : {}),
  };

  return runOpencodeSegment({
    db,
    slack,
    runId: setup.runId,
    spaceId: input.spaceId,
    workspaceId: input.workspaceId,
    threadId: setup.threadId,
    organizationId: input.organizationId,
    channelId: input.channelId,
    slackMessageTs: setup.slackMessageTs,
    slackStream: setup.slackStream,
    triggerText: input.triggerText,
    actorSlackUserId: input.actorSlackUserId,
    spaceName: input.spaceName,
    appUrl: input.appUrl,
    providerConfig,
    continuation,
  });
}

async function resumeAfterQuestionStep(
  input: TagsRunInput,
  setup: RunSetup,
  segment: { requestId: string; questionText: string },
  answer: string,
) {
  const { db, slack, providerConfig } = await loadWorkspaceRuntime(input.workspaceId);

  const continuation: OpencodeContinuation = {
    kind: "question_answered",
    questionText: segment.questionText,
    answer,
  };

  return runOpencodeSegment({
    db,
    slack,
    runId: setup.runId,
    spaceId: input.spaceId,
    workspaceId: input.workspaceId,
    threadId: setup.threadId,
    organizationId: input.organizationId,
    channelId: input.channelId,
    slackMessageTs: setup.slackMessageTs,
    slackStream: setup.slackStream,
    triggerText: input.triggerText,
    actorSlackUserId: input.actorSlackUserId,
    spaceName: input.spaceName,
    appUrl: input.appUrl,
    providerConfig,
    continuation,
  });
}

async function completeQuestionStep(
  runId: string,
  segment: { invocationId: string },
  answer: string,
) {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);
  const result = { answer };

  await completeToolInvocation(db, segment.invocationId, {
    status: "succeeded",
    result,
  });

  await appendRunEvent(db, runId, {
    type: "tool.finished",
    toolName: "ask_user",
    outputPreview: result,
  });
}

async function expireQuestionStep(requestId: string) {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);
  const { expireQuestionByRequestId } = await import("@tags/core/questions");
  await expireQuestionByRequestId(db, requestId);
}

async function finalizeRunStep(args: {
  runId: string;
  workspaceId: string;
  channelId: string;
  slackMessageTs: string;
  slackStream: boolean;
  summaryText: string;
  appUrl?: string;
}) {
  const { db, slack } = await loadWorkspaceRuntime(args.workspaceId);
  const stream = new SlackStreamAdapter(slack, args.channelId, args.slackMessageTs, {
    native: args.slackStream,
  });
  const blocks = args.appUrl ? buildRunLinkBlock(args.appUrl, args.runId) : undefined;
  await stream.finalize(args.summaryText, blocks);

  await appendRunEvent(db, args.runId, { type: "run.finished" });
  await updateRunStatus(db, args.runId, "done", { finishedAt: new Date() });
}

async function rejectToolStep(args: { runId: string; invocationId: string; toolName: string }) {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);
  const emit = async (event: TagsEvent) => {
    await appendRunEvent(db, args.runId, event);
  };
  await rejectPendingTool(db, args.invocationId, args.toolName, emit);
}

async function expireApprovalStep(requestId: string) {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);
  await expireApprovalByRequestId(db, requestId);
}

async function releaseThreadStep(
  threadId: string,
  runId: string,
  status: "done" | "failed",
) {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);
  await db
    .update(threads)
    .set({ activeRunId: null, status, updatedAt: new Date() })
    .where(and(eq(threads.id, threadId), eq(threads.activeRunId, runId)));
}

async function finalizeReactionStep(
  workspaceId: string,
  channelId: string,
  triggerMessageTs: string,
  status: "done" | "failed",
) {
  const { slack } = await loadWorkspaceRuntime(workspaceId);
  await removeReaction(slack, channelId, triggerMessageTs, "eyes").catch(() => {});
  await addReaction(
    slack,
    channelId,
    triggerMessageTs,
    status === "done" ? "white_check_mark" : "x",
  ).catch(() => {});
}
