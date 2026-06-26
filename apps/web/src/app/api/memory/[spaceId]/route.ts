import { listMemoriesForSpace } from "@tags/core/memory";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!(await isAdminAuthorized(request))) return adminUnauthorizedResponse();
  const { spaceId } = await params;
  const db = getDb();
  const memories = await listMemoriesForSpace(db, spaceId);
  return Response.json({ memories });
}
