import { eq } from "drizzle-orm";
import type { InngestFunction } from "inngest";
import { appendRunEvent, createRun, updateRunStatus } from "@tags/core/runs";
import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { findOrCreateThread, upsertMessage } from "@tags/core/threads";
import type { TagsEvent } from "@tags/core/events";
import { createDb, runs, threads } from "@tags/db";
import { createSlackClient, postThreadMessage, SlackStreamAdapter, buildRunLinkBlock, updateMessage } from "@tags/slack";
import { parseRememberCommand } from "../context/builder";
import { syncSlackThreadToDb } from "@tags/slack/sync-thread";
import { saveMemory } from "@tags/core/memory";
import {
  executeApprovedTool,
  rejectPendingTool,
  runAgentSegment,
  type AgentLoopArgs,
} from "../agent/loop";
import { runOpencodeSegment } from "../agent/opencode-segment";
import { createRuntimeProviders } from "../providers";
import { buildRuntimeProviderConfig, loadRuntimeSecrets } from "../secrets";
import type { UICard } from "@tags/core/ui-cards";
import {
  APPROVAL_RESOLVED_EVENT,
  RUN_REQUESTED_EVENT,
  inngest,
} from "./client";

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
};

type RunSetup = {
  runId: string;
  threadId: string;
  slackMessageTs: string;
};

export const tagsRunFunction: InngestFunction.Any = inngest.createFunction(
  { id: "tags-run", retries: 2, triggers: [{ event: RUN_REQUESTED_EVENT }] },
  async ({ event, step }) => {
    const input = event.data as TagsRunInput;

    const setup = (await step.run("ingest", () => ingestStep(input))) as RunSetup;

    const segment = await step.run("agent-segment", () => agentSegmentStep(input, setup));

    if (segment.kind === "approval_required") {
      const resolved = await step.waitForEvent("await-approval", {
        event: APPROVAL_RESOLVED_EVENT,
        timeout: "1h",
        if: `async.data.requestId == "${segment.requestId}"`,
      });

      const approved = resolved?.data?.decision === "approved";

      if (approved) {
        const toolResult = (await step.run("execute-approved", () =>
          executeApprovedToolStep(input, setup, segment),
        )) as { modelOutput: unknown; uiCard?: UICard };

        await step.run("resume-after-approval", () =>
          resumeAfterApprovalStep(input, setup, segment, toolResult),
        );
      } else {
        await step.run("reject-tool", () =>
          rejectToolStep({
            runId: setup.runId,
            invocationId: segment.invocationId,
            toolName: segment.toolName,
          }),
        );
        await step.run("finalize-rejected", () =>
          finalizeRunStep({
            runId: setup.runId,
            channelId: input.channelId,
            slackMessageTs: setup.slackMessageTs,
            summaryText: resolved
              ? `Rejected ${segment.toolName}.`
              : `Approval for ${segment.toolName} timed out.`,
            appUrl: input.appUrl,
          }),
        );
      }
    }

    await step.run("release-thread", () => releaseThreadStep(setup.threadId));

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

  const thread = await findOrCreateThread(db, {
    organizationId: input.organizationId,
    spaceId: input.spaceId,
    providerThreadId: input.threadTs,
    rootMessageId: input.rootMessageTs,
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

  await upsertMessage(db, {
    organizationId: input.organizationId,
    spaceId: input.spaceId,
    threadId: thread.id,
    providerMessageId: input.triggerMessageTs,
    authorType: "human",
    authorId: input.actorSlackUserId,
    text: input.triggerText,
  });

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
      trigger: input.trigger,
      idempotencyKey: input.idempotencyKey,
    })) ??
    (
      await db.select().from(runs).where(eq(runs.idempotencyKey, input.idempotencyKey)).limit(1)
    )[0];

  if (!run) {
    throw new Error("Failed to create or find run");
  }

  await db
    .update(threads)
    .set({ activeRunId: run.id, status: "running", updatedAt: new Date() })
    .where(eq(threads.id, thread.id));

  const slackRef = await postThreadMessage(slack, input.channelId, input.threadTs, "Tags is working…");

  return {
    runId: run.id,
    threadId: thread.id,
    slackMessageTs: slackRef.messageTs,
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
      threadTs: input.threadTs,
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
    threadTs: input.threadTs,
    slackMessageTs: setup.slackMessageTs,
    triggerText: input.triggerText,
    actorUserId: input.actorSlackUserId,
    spaceName: input.spaceName,
    appUrl: input.appUrl,
    providerConfig: buildRuntimeProviderConfig(secrets),
    approvedRequestId: segment.requestId,
    approvedToolContinuation: {
      toolName: segment.toolName,
      toolInput: segment.toolInput,
      toolOutput: toolResult.modelOutput,
      uiCard: toolResult.uiCard,
    },
  };

  return runAgentSegment(loopArgs);
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

async function releaseThreadStep(threadId: string) {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);
  await db
    .update(threads)
    .set({ activeRunId: null, status: "done", updatedAt: new Date() })
    .where(eq(threads.id, threadId));
}
