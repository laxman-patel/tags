import { softDeleteMemory } from "@tags/core/memory";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ memoryId: string }> },
) {
  if (!(await isAdminAuthorized(request))) return adminUnauthorizedResponse();
  const { memoryId } = await params;
  const db = getDb();
  await softDeleteMemory(db, memoryId);
  return Response.json({ ok: true });
}
