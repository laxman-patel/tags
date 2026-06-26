import { resolveApprovalByRequestId } from "@tags/core/runs";
import { approvalHook } from "@tags/runtime";
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
  const approval = await resolveApprovalByRequestId(db, requestId, decision);

  if (!approval) {
    return Response.json({
      response_type: "ephemeral",
      text: "This approval was already resolved.",
    });
  }

  await approvalHook.resume(requestId, { decision });

  return Response.json({
    response_type: "ephemeral",
    text: decision === "approved" ? "Approved. Resuming run…" : "Rejected.",
  });
}
