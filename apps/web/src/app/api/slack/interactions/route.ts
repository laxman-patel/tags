import { resolveApprovalByRequestId } from "@tags/core/runs";
import { canApprove } from "@tags/core/policies";
import { recordAuditEvent } from "@tags/core/audit";
import { inngest, APPROVAL_RESOLVED_EVENT } from "@tags/runtime";
import { getEnv } from "@/env";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type SlackInteractionPayload = {
  type: string;
  user: { id: string };
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
  if (payload.type !== "block_actions" || !payload.actions?.[0]) {
    return new Response("ok");
  }

  const action = payload.actions[0];
  const actionId = action.action_id;
  const requestId = action.value;

  if (!requestId || !actionId.startsWith("approval:")) {
    return new Response("ok");
  }

  const decision = actionId.includes(":approve:") ? "approved" : "rejected";
  const db = getDb();

  const { approvalRequests } = await import("@tags/db");
  const { eq } = await import("drizzle-orm");
  const pending = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.requestId, requestId))
    .limit(1);
  const approval = pending[0];

  if (!approval) {
    return Response.json({ response_type: "ephemeral", text: "Approval not found." });
  }

  const allowed = await canApprove(db, {
    spaceId: approval.spaceId,
    organizationId: approval.organizationId,
    slackUserId: payload.user.id,
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
