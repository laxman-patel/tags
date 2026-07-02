import { expireApprovalByRequestId, resolveApprovalByRequestId } from "@tags/core/runs";
import { answerQuestionByRequestId, expireQuestionByRequestId, getQuestionByRequestId } from "@tags/core/questions";
import { canApprove } from "@tags/core/policies";
import { recordAuditEvent } from "@tags/core/audit";
import { inngest, APPROVAL_RESOLVED_EVENT, QUESTION_ANSWERED_EVENT } from "@tags/runtime";
import { getEnv } from "@/env";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type SlackInteractionPayload = {
  type: string;
  user: { id: string };
  trigger_id?: string;
  view?: {
    callback_id: string;
    private_metadata?: string;
    state?: {
      values?: Record<string, Record<string, { value?: string }>>;
    };
  };
  actions?: Array<{
    action_id: string;
    value?: string;
  }>;
};

export async function POST(request: Request) {
  const env = getEnv();
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  const { verifySlackSignature } = await import("@tags/slack");
  if (!verifySlackSignature(env.SLACK_SIGNING_SECRET, rawBody, timestamp, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadJson = params.get("payload");
  if (!payloadJson) {
    return new Response("Missing payload", { status: 400 });
  }

  const payload = JSON.parse(payloadJson) as SlackInteractionPayload;

  if (payload.type === "view_submission" && payload.view?.callback_id === "question_answer") {
    return handleQuestionSubmission(payload);
  }

  if (payload.type === "block_actions" && payload.actions?.[0]) {
    const action = payload.actions[0];
    if (action.action_id.startsWith("question:answer:")) {
      return openQuestionModal(payload, action.value ?? "");
    }
    if (action.action_id.startsWith("approval:")) {
      return handleApprovalAction(payload, action);
    }
  }

  return new Response("ok");
}

async function openQuestionModal(payload: SlackInteractionPayload, requestId: string) {
  if (!payload.trigger_id || !requestId) {
    return new Response("ok");
  }

  const db = getDb();
  const question = await getQuestionByRequestId(db, requestId);
  if (!question || question.status !== "pending") {
    return Response.json({
      response_type: "ephemeral",
      text: "Question not found or already answered.",
    });
  }

  if (question.expiresAt && question.expiresAt < new Date()) {
    await expireQuestionByRequestId(db, requestId);
    return Response.json({
      response_type: "ephemeral",
      text: "This question has expired.",
    });
  }

  const { createSlackClient } = await import("@tags/slack");
  const client = createSlackClient(getEnv().SLACK_BOT_TOKEN);

  await client.views.open({
    trigger_id: payload.trigger_id,
    view: {
      type: "modal",
      callback_id: "question_answer",
      private_metadata: requestId,
      title: { type: "plain_text", text: "Answer Tags" },
      submit: { type: "plain_text", text: "Submit" },
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: question.questionText },
        },
        {
          type: "input",
          block_id: "answer_block",
          element: {
            type: "plain_text_input",
            action_id: "answer_input",
            multiline: true,
          },
          label: { type: "plain_text", text: "Your answer" },
        },
      ],
    },
  });

  return new Response("ok");
}

async function handleQuestionSubmission(payload: SlackInteractionPayload) {
  const requestId = payload.view?.private_metadata ?? "";
  const answer =
    payload.view?.state?.values?.answer_block?.answer_input?.value?.trim() ?? "";

  if (!requestId || !answer) {
    return Response.json({
      response_action: "errors",
      errors: { answer_block: "Please provide an answer." },
    });
  }

  const db = getDb();
  const question = await getQuestionByRequestId(db, requestId);

  if (!question || question.status !== "pending") {
    return Response.json({
      response_action: "errors",
      errors: { answer_block: "Question not found or already answered." },
    });
  }

  if (question.expiresAt && question.expiresAt < new Date()) {
    await expireQuestionByRequestId(db, requestId);
    return Response.json({
      response_action: "errors",
      errors: { answer_block: "This question has expired." },
    });
  }

  const answered = await answerQuestionByRequestId(db, requestId, answer);
  if (!answered) {
    return Response.json({
      response_action: "errors",
      errors: { answer_block: "Could not save answer." },
    });
  }

  await recordAuditEvent(db, {
    organizationId: question.organizationId,
    spaceId: question.spaceId,
    actorType: "human",
    eventType: "question.answered",
    payload: { questionId: question.id, slackUserId: payload.user.id },
  });

  await inngest.send({
    name: QUESTION_ANSWERED_EVENT,
    data: { requestId, answer },
  });

  return Response.json({ response_action: "clear" });
}

async function handleApprovalAction(
  payload: SlackInteractionPayload,
  action: { action_id: string; value?: string },
) {
  const actionId = action.action_id;
  const requestId = action.value;

  if (!requestId || !actionId.startsWith("approval:")) {
    return new Response("ok");
  }

  const decision = actionId.includes(":approve:") ? "approved" : "rejected";
  const db = getDb();

  const { approvalRequests, eq } = await import("@tags/db");
  const pending = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.requestId, requestId))
    .limit(1);
  const approval = pending[0];

  if (!approval) {
    return Response.json({ response_type: "ephemeral", text: "Approval not found." });
  }

  if (approval.status !== "pending") {
    return Response.json({
      response_type: "ephemeral",
      text: "This approval was already resolved.",
    });
  }

  if (approval.expiresAt && approval.expiresAt < new Date()) {
    await expireApprovalByRequestId(db, requestId);
    return Response.json({
      response_type: "ephemeral",
      text: "This approval has expired.",
    });
  }

  const allowed = await canApprove(db, {
    spaceId: approval.spaceId,
    organizationId: approval.organizationId,
    slackUserId: payload.user.id,
    requesterSlackUserId: approval.requestedBySlackUserId ?? undefined,
  });

  if (!allowed) {
    return Response.json({
      response_type: "ephemeral",
      text: "You are not authorized to approve this action.",
    });
  }

  const resolved = await resolveApprovalByRequestId(db, requestId, decision);

  if (!resolved) {
    return Response.json({
      response_type: "ephemeral",
      text: "This approval was already resolved.",
    });
  }

  await recordAuditEvent(db, {
    organizationId: approval.organizationId,
    spaceId: approval.spaceId,
    actorType: "human",
    eventType: "approval.resolved",
    payload: { approvalId: approval.id, decision, slackUserId: payload.user.id },
  });

  await inngest.send({ name: APPROVAL_RESOLVED_EVENT, data: { requestId, decision } });

  return Response.json({
    response_type: "ephemeral",
    text: decision === "approved" ? "Approved. Resuming run…" : "Rejected.",
  });
}
