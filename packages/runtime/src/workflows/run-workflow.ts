import { eq } from "drizzle-orm";
import { defineHook } from "workflow";
import { appendRunEvent, createRun } from "@tags/core/runs";
import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { findOrCreateThread, upsertMessage } from "@tags/core/threads";
import { createDb, runs, threads } from "@tags/db";
import { createSlackClient, postThreadMessage } from "@tags/slack";
import {
  executeApprovedTool,
  rejectPendingTool,
  runAgentSegment,
  type AgentLoopArgs,
} from "../agent/loop";

export const approvalHook = defineHook<{ decision: "approved" | "rejected" }>();

export type TagsWorkflowInput = {
  databaseUrl: string;
  gatewayApiKey: string;
  slackBotToken: string;
  organizationId: string;
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
};

export async function tagsRunWorkflow(input: TagsWorkflowInput) {
  "use workflow";

  const setup = await ingestStep(input);

  let iterations = 0;

  while (iterations < 8) {
    iterations += 1;

    const segment = await agentSegmentStep({
      ...input,
      runId: setup.runId,
      threadId: setup.threadId,
      slackMessageTs: setup.slackMessageTs,
    });

    if (segment.kind === "complete") {
      break;
    }

    const hook = approvalHook.create({ token: segment.requestId });
    const decision = await hook;

    if (decision.decision === "approved") {
      const toolOutput = await executeApprovedToolStep({
        ...input,
        runId: setup.runId,
        threadId: setup.threadId,
        segment,
      });
      await finalizeRunStep({
        databaseUrl: input.databaseUrl,
        slackBotToken: input.slackBotToken,
        runId: setup.runId,
        threadId: setup.threadId,
        channelId: input.channelId,
        slackMessageTs: setup.slackMessageTs,
        summaryText: `Approved and executed ${segment.toolName}: ${JSON.stringify(toolOutput)}`,
        appUrl: input.appUrl,
      });
      break;
    }

    await rejectToolStep({
      databaseUrl: input.databaseUrl,
      runId: setup.runId,
      invocationId: segment.invocationId,
      toolName: segment.toolName,
    });
    await finalizeRunStep({
      databaseUrl: input.databaseUrl,
      slackBotToken: input.slackBotToken,
      runId: setup.runId,
      threadId: setup.threadId,
      channelId: input.channelId,
      slackMessageTs: setup.slackMessageTs,
      summaryText: `Rejected ${segment.toolName}.`,
      appUrl: input.appUrl,
    });
    break;
  }

  await releaseThreadStep(input.databaseUrl, setup.threadId);
}

async function ingestStep(input: TagsWorkflowInput) {
  "use step";

  const db = createDb(input.databaseUrl);
  const slack = createSlackClient(input.slackBotToken);
  const config = await loadActiveSpaceConfig(db, input.spaceId);

  if (!config) {
    throw new Error(`No active config for space ${input.spaceId}`);
  }

  const thread = await findOrCreateThread(db, {
    organizationId: input.organizationId,
    spaceId: input.spaceId,
    providerThreadId: input.threadTs,
    rootMessageId: input.rootMessageTs,
  });

  await upsertMessage(db, {
    organizationId: input.organizationId,
    spaceId: input.spaceId,
    threadId: thread.id,
    providerMessageId: input.triggerMessageTs,
    authorType: "human",
    authorId: input.actorSlackUserId,
    text: input.triggerText,
  });

  const { syncSlackThreadToDb } = await import("@tags/slack/sync-thread");
  await syncSlackThreadToDb(slack, db, {
    organizationId: input.organizationId,
    spaceId: input.spaceId,
    threadId: thread.id,
    channelId: input.channelId,
    threadTs: input.threadTs,
  });

  const run =
    (await createRun(db, {
      organizationId: input.organizationId,
      spaceId: input.spaceId,
      threadId: thread.id,
      spaceConfigVersion: config.version,
      modelId: config.modelId,
      trigger: "mention",
      idempotencyKey: input.idempotencyKey,
    })) ??
    (
      await db
        .select()
        .from(runs)
        .where(eq(runs.idempotencyKey, input.idempotencyKey))
        .limit(1)
    )[0];

  if (!run) {
    throw new Error("Failed to create or find run");
  }

  await db
    .update(threads)
    .set({ activeRunId: run.id, status: "running", updatedAt: new Date() })
    .where(eq(threads.id, thread.id));

  const slackRef = await postThreadMessage(
    slack,
    input.channelId,
    input.threadTs,
    "Tags is working…",
  );

  return {
    runId: run.id,
    threadId: thread.id,
    slackMessageTs: slackRef.messageTs,
  };
}

async function agentSegmentStep(
  args: TagsWorkflowInput & {
    runId: string;
    threadId: string;
    slackMessageTs: string;
  },
) {
  "use step";

  const db = createDb(args.databaseUrl);
  const slack = createSlackClient(args.slackBotToken);

  const loopArgs: AgentLoopArgs = {
    db,
    slack,
    gatewayApiKey: args.gatewayApiKey,
    runId: args.runId,
    spaceId: args.spaceId,
    threadId: args.threadId,
    organizationId: args.organizationId,
    channelId: args.channelId,
    threadTs: args.threadTs,
    slackMessageTs: args.slackMessageTs,
    triggerText: args.triggerText,
    actorUserId: args.actorSlackUserId,
    spaceName: args.spaceName,
    appUrl: args.appUrl,
  };

  return runAgentSegment(loopArgs);
}

async function executeApprovedToolStep(
  args: TagsWorkflowInput & {
    runId: string;
    threadId: string;
    segment: {
      invocationId: string;
      toolName: string;
      toolInput: unknown;
    };
  },
) {
  "use step";

  const db = createDb(args.databaseUrl);
  const emit = async (event: import("@tags/core/events").TagsEvent) => {
    await appendRunEvent(db, args.runId, event);
  };

  return executeApprovedTool(db, {
    runId: args.runId,
    organizationId: args.organizationId,
    spaceId: args.spaceId,
    threadId: args.threadId,
    actorUserId: args.actorSlackUserId,
    toolName: args.segment.toolName,
    toolInput: args.segment.toolInput,
    invocationId: args.segment.invocationId,
    emit,
  });
}

async function finalizeRunStep(args: {
  databaseUrl: string;
  slackBotToken: string;
  runId: string;
  threadId: string;
  channelId: string;
  slackMessageTs: string;
  summaryText: string;
  appUrl?: string;
}) {
  "use step";

  const db = createDb(args.databaseUrl);
  const { SlackStreamAdapter, buildRunLinkBlock, updateMessage } = await import("@tags/slack");
  const { appendRunEvent, updateRunStatus } = await import("@tags/core/runs");

  const slack = createSlackClient(args.slackBotToken);
  const stream = new SlackStreamAdapter(slack, args.channelId, args.slackMessageTs);
  await stream.finalize(args.summaryText);

  if (args.appUrl) {
    const blocks = buildRunLinkBlock(args.appUrl, args.runId);
    await updateMessage(slack, args.channelId, args.slackMessageTs, args.summaryText, blocks);
  }

  await appendRunEvent(db, args.runId, { type: "run.finished" });
  await updateRunStatus(db, args.runId, "done", { finishedAt: new Date() });
}

async function rejectToolStep(args: {
  databaseUrl: string;
  runId: string;
  invocationId: string;
  toolName: string;
}) {
  "use step";

  const db = createDb(args.databaseUrl);
  const emit = async (event: import("@tags/core/events").TagsEvent) => {
    await appendRunEvent(db, args.runId, event);
  };
  await rejectPendingTool(db, args.invocationId, args.toolName, emit);
}

async function releaseThreadStep(databaseUrl: string, threadId: string) {
  "use step";

  const db = createDb(databaseUrl);
  await db
    .update(threads)
    .set({ activeRunId: null, status: "done", updatedAt: new Date() })
    .where(eq(threads.id, threadId));
}
