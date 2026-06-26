import { listMemoriesForSpace } from "@tags/core/memory";
import { listAuditEvents } from "@tags/core/audit";
import { organizations } from "@tags/db";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();
  const db = getDb();
  const rows = await db.select().from(organizations).limit(1);
  const orgId = rows[0]?.id;
  if (!orgId) return Response.json({ error: "No org" }, { status: 400 });

  const url = new URL(request.url);
  const spaceId = url.searchParams.get("spaceId");

  const memories = spaceId ? await listMemoriesForSpace(db, spaceId) : [];
  const audit = await listAuditEvents(db, orgId, 500);

  return Response.json({
    exportedAt: new Date().toISOString(),
    organizationId: orgId,
    spaceId,
    memories,
    auditEvents: audit,
  });
}
