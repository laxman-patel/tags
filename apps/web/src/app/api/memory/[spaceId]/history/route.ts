import { listSpaceMemoryHistory } from "@tags/core/file-memory";
import { getSpaceById } from "@tags/core/spaces-admin";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { getEnv } from "@/env";
import { createR2ClientFromEnv } from "@/lib/r2";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();
  const { spaceId } = await params;
  const db = getDb();
  const space = await getSpaceById(db, spaceId);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });

  const r2 = createR2ClientFromEnv(getEnv());
  if (!r2) return Response.json({ configured: false, history: [] });

  const history = await listSpaceMemoryHistory(r2, {
    organizationId: space.organizationId,
    spaceId,
  });

  return Response.json({ configured: true, history });
}
