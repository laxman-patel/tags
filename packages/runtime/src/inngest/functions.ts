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
import { findOrCreateThread, upsertMessage } from "@tags/core/threads";
import type { TagsEvent } from "@tags/core/events";
import { createDb, runs, threads } from "@tags/db";
import {
  createSlackClient,
  postThreadMessage,
  SlackStreamAdapter,
  buildRunLinkBlock,
  updateMessage,
} from "@tags/slack";
import { parseRememberCommand } from "../context/builder";
import { setSentryRunContext } from "../observability/sentry";
import { syncSlackThreadToDb } from "@tags/slack/sync-thread";
import { saveMemory } from "@tags/core/memory";
import {
  executeApprovedTool,
  rejectPendingTool,
  runAgentSegment,
  type AgentLoopArgs,
} from "../agent/loop";
import type { AgentSegmentResult } from "../agent/types";
import { runOpencodeSegment } from "../agent/opencode-segment";
import { createRuntimeProviders } from "../providers";
import { buildRuntimeProviderConfig, loadRuntimeSecrets } from "../secrets";
import { loadComposioTools } from "../tools/composio";
import type { UICard } from "@tags/core/ui-cards";
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
};

type RunSetup = {
  runId: string;
  threadId: string;
  slackMessageTs: string;
  threadTs: string;
  skipped?: boolean;
};

export const tagsRunFunction: InngestFunction.Any = inngest.createFunction(
  { id: "tags-run", retries: 2, triggers: [{ event: RUN_REQUESTED_EVENT }] },
  async ({ event, step }) => {
    const input = event.data as TagsRunInput;

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
                  channelId: input.channelId,
                  slackMessageTs: setup.slackMessageTs,
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
                  channelId: input.channelId,
                  slackMessageTs: setup.slackMessageTs,
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
    } catch {
      threadStatus = "failed";
      throw;
    } finally {
      await step.run("release-thread", () =>
        releaseThreadStep(setup.threadId, setup.runId, threadStatus),
      );
    }

    return { runId: setup.runId };
  },
);

async function ingestStep(input: TagsRunInput): Promise<RunSetup> {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);
  const slack = createSlackClient(secrets.slackBotToken);
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

  const remember = parseRememberCommand(input.triggerText);
  if (remember) {
    await saveMemory(db, {
      organizationId: input.organizationId,
      spaceId: input.spaceId,
      kind: "fact",
      content: remember,
      createdBy: "human",
      sourceThreadId: thread.id,
    });
  }

  if (!input.isScheduled) {
    await upsertMessage(db, {
      organizationId: input.organizationId,
      spaceId: input.spaceId,
      threadId: thread.id,
      providerMessageId: triggerMessageTs,
      authorType: "human",
      authorId: input.actorSlackUserId,
      text: input.triggerText,
    });
  }

  if (!input.isScheduled) {
    await syncSlackThreadToDb(slack, db, {
      organizationId: input.organizationId,
      spaceId: input.spaceId,
      threadId: thread.id,
      channelId: input.channelId,
      threadTs,
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
    await postThreadMessage(
      slack,
      input.channelId,
      threadTs,
      "Still working on the previous request in this thread.",
    );
    return {
      runId: run.id,
      threadId: thread.id,
      slackMessageTs: "",
      threadTs,
      skipped: true,
    };
  }

  const slackRef = await postThreadMessage(
    slack,
    input.channelId,
    threadTs,
    "Tags is working…",
  );

  setSentryRunContext({
    organizationId: input.organizationId,
    spaceId: input.spaceId,
    runId: run.id,
  });

  return {
    runId: run.id,
    threadId: thread.id,
    slackMessageTs: slackRef.messageTs,
    threadTs,
  };
}

async function agentSegmentStep(input: TagsRunInput, setup: RunSetup) {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);
  const slack = createSlackClient(secrets.slackBotToken);
  const config = await loadActiveSpaceConfig(db, input.spaceId);
  const providerConfig = buildRuntimeProviderConfig(secrets);

  if (config?.runtimeMode === "orchestrator") {
    const loopArgs: AgentLoopArgs = {
      db,
      slack,
      fireworksApiKey: secrets.fireworksApiKey,
      runId: setup.runId,
      spaceId: input.spaceId,
      workspaceId: input.workspaceId,
      threadId: setup.threadId,
      organizationId: input.organizationId,
      channelId: input.channelId,
      threadTs: setup.threadTs,
      slackMessageTs: setup.slackMessageTs,
      triggerText: input.triggerText,
      actorUserId: input.actorSlackUserId,
      spaceName: input.spaceName,
      appUrl: input.appUrl,
      providerConfig,
    };

    return runAgentSegment(loopArgs);
  }

  return runOpencodeSegment({
    db,
    slack,
    runId: setup.runId,
    spaceId: input.spaceId,
    threadId: setup.threadId,
    organizationId: input.organizationId,
    channelId: input.channelId,
    slackMessageTs: setup.slackMessageTs,
    triggerText: input.triggerText,
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
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);
  const slack = createSlackClient(secrets.slackBotToken);
  const stream = new SlackStreamAdapter(slack, input.channelId, setup.slackMessageTs);
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

  const providers = await createRuntimeProviders(buildRuntimeProviderConfig(secrets));
  const toolOptions = { appUrl: input.appUrl, ...providers };

  return executeApprovedTool(db, {
    runId: setup.runId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    spaceId: input.spaceId,
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
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);
  const slack = createSlackClient(secrets.slackBotToken);

  const loopArgs: AgentLoopArgs = {
    db,
    slack,
    fireworksApiKey: secrets.fireworksApiKey,
    runId: setup.runId,
    spaceId: input.spaceId,
    workspaceId: input.workspaceId,
    threadId: setup.threadId,
    organizationId: input.organizationId,
    channelId: input.channelId,
    threadTs: setup.threadTs,
    slackMessageTs: setup.slackMessageTs,
    triggerText: input.triggerText,
    actorUserId: input.actorSlackUserId,
    spaceName: input.spaceName,
    appUrl: input.appUrl,
    providerConfig: buildRuntimeProviderConfig(secrets),
    approvedToolContinuation: {
      toolName: segment.toolName,
      toolInput: segment.toolInput,
      toolOutput: toolResult.modelOutput,
      uiCard: toolResult.uiCard,
    },
  };

  return runAgentSegment(loopArgs);
}

async function resumeAfterQuestionStep(
  input: TagsRunInput,
  setup: RunSetup,
  segment: { requestId: string; questionText: string },
  answer: string,
) {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);
  const slack = createSlackClient(secrets.slackBotToken);

  const loopArgs: AgentLoopArgs = {
    db,
    slack,
    fireworksApiKey: secrets.fireworksApiKey,
    runId: setup.runId,
    spaceId: input.spaceId,
    workspaceId: input.workspaceId,
    threadId: setup.threadId,
    organizationId: input.organizationId,
    channelId: input.channelId,
    threadTs: setup.threadTs,
    slackMessageTs: setup.slackMessageTs,
    triggerText: input.triggerText,
    actorUserId: input.actorSlackUserId,
    spaceName: input.spaceName,
    appUrl: input.appUrl,
    providerConfig: buildRuntimeProviderConfig(secrets),
    approvedToolContinuation: {
      toolName: "ask_user",
      toolInput: { question: segment.questionText },
      toolOutput: { answer },
    },
  };

  return runAgentSegment(loopArgs);
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
  channelId: string;
  slackMessageTs: string;
  summaryText: string;
  appUrl?: string;
}) {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);

  const slack = createSlackClient(secrets.slackBotToken);
  const stream = new SlackStreamAdapter(slack, args.channelId, args.slackMessageTs);
  await stream.finalize(args.summaryText);

  if (args.appUrl) {
    const blocks = buildRunLinkBlock(args.appUrl, args.runId);
    await updateMessage(slack, args.channelId, args.slackMessageTs, args.summaryText, blocks);
  }

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
