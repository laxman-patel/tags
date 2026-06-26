import { resolveApprovalRequest } from "@tags/core/runs";
import { approvalHook } from "@tags/runtime";
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

  await approvalHook.resume(resolved.requestId, { decision: body.decision });
  return Response.json({ ok: true });
}
