import { count, desc, eq, inArray } from "drizzle-orm";
import { organizations, runs, spaces, toolInvocations } from "@tags/db";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();

  const db = getDb();
  const orgHeader = request.headers.get("x-tags-org-id");
  let orgId = orgHeader ?? "";
  if (!orgId) {
    const rows = await db.select().from(organizations).limit(1);
    orgId = rows[0]?.id ?? "";
  }

  if (!orgId) return Response.json({ runs: [] });

  const rows = await db
    .select({
      run: runs,
      spaceName: spaces.name,
      spaceSlug: spaces.slug,
      externalSpaceId: spaces.externalSpaceId,
    })
    .from(runs)
    .innerJoin(spaces, eq(runs.spaceId, spaces.id))
    .where(eq(runs.organizationId, orgId))
    .orderBy(desc(runs.startedAt))
    .limit(100);

  const runIds = rows.map((row) => row.run.id);
  const counts =
    runIds.length > 0
      ? await db
          .select({ runId: toolInvocations.runId, count: count() })
          .from(toolInvocations)
          .where(inArray(toolInvocations.runId, runIds))
          .groupBy(toolInvocations.runId)
      : [];
  const countByRun = new Map(counts.map((entry) => [entry.runId, Number(entry.count)]));

  return Response.json({
    runs: rows.map((row) => ({
      ...row.run,
      spaceName: row.spaceName,
      spaceSlug: row.spaceSlug,
      externalSpaceId: row.externalSpaceId,
      toolCalls: countByRun.get(row.run.id) ?? 0,
    })),
  });
}
