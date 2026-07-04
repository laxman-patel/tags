import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function DELETE() {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();
  return Response.json(
    {
      error:
        "Legacy Postgres memory rows are read-only. Use /api/memory/:spaceId to edit file-backed Space memory.",
    },
    { status: 410 },
  );
}
