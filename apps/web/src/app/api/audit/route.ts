import { listAuditEvents } from "@tags/core/audit";
import { organizations } from "@tags/db";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await isAdminAuthorized(request))) return adminUnauthorizedResponse();
  const db = getDb();
  const orgHeader = request.headers.get("x-tags-org-id");
  let orgId = orgHeader ?? "";
  if (!orgId) {
    const rows = await db.select().from(organizations).limit(1);
    orgId = rows[0]?.id ?? "";
  }
  const events = await listAuditEvents(db, orgId);
  return Response.json({ events });
}
