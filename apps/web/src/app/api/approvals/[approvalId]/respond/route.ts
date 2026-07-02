import { expireApprovalByRequestId, resolveApprovalRequest } from "@tags/core/runs";
import { inngest, APPROVAL_RESOLVED_EVENT } from "@tags/runtime";
import { recordAuditEvent } from "@tags/core/audit";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ approvalId: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();
  const { approvalId } = await params;
  const body = (await request.json()) as { decision: "approved" | "rejected" };
  const db = getDb();

  const { approvalRequests } = await import("@tags/db");
  const { eq } = await import("drizzle-orm");
  const pending = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, approvalId))
    .limit(1);
  const approval = pending[0];

  if (!approval || approval.status !== "pending") {
    return Response.json({ error: "Not found or already resolved" }, { status: 404 });
  }

  if (approval.expiresAt && approval.expiresAt < new Date()) {
    await expireApprovalByRequestId(db, approval.requestId);
    return Response.json({ error: "Approval expired" }, { status: 410 });
  }

  const resolved = await resolveApprovalRequest(db, approvalId, body.decision);
  if (!resolved) {
    return Response.json({ error: "Not found or already resolved" }, { status: 404 });
  }

  await recordAuditEvent(db, {
    organizationId: resolved.organizationId,
    spaceId: resolved.spaceId,
    actorType: "human",
    eventType: "approval.resolved",
    payload: { approvalId, decision: body.decision, source: "web" },
  });

  await inngest.send({
    name: APPROVAL_RESOLVED_EVENT,
    data: { requestId: resolved.requestId, decision: body.decision },
  });
  return Response.json({ ok: true });
}
