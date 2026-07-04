import { loadSpaceMemoryHistoryItem, memoryUsage } from "@tags/core/file-memory";
import { getSpaceById } from "@tags/core/spaces-admin";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { getEnv } from "@/env";
import { createR2ClientFromEnv } from "@/lib/r2";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spaceId: string; revisionId: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();
  const { spaceId, revisionId } = await params;
  const db = getDb();
  const space = await getSpaceById(db, spaceId);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });

  const r2 = createR2ClientFromEnv(getEnv());
  if (!r2) return Response.json({ error: "R2 memory storage is not configured" }, { status: 503 });

  const item = await loadSpaceMemoryHistoryItem(
    r2,
    { organizationId: space.organizationId, spaceId },
    revisionId,
  );
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({
    revisionId,
    entries: item.memory.entries,
    raw: item.memory.raw,
    etag: item.memory.etag,
    usage: memoryUsage(item.memory),
    manifest: item.manifest,
  });
}
