import { listSpaces, createSpaceWithConfig } from "@tags/core/spaces-admin";
import { eq, organizations, spaces, workspaces } from "@tags/db";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { withSpan } from "@superlog/otel-helpers";
import { emitWebInfo, spacesRequestsCompleted, webTracer } from "@/lib/otel";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return await withSpan("spaces.list", async (span) => {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();

  const db = getDb();
  const orgId = request.headers.get("x-tags-org-id") ?? await getDefaultOrgId(db);
  span.setAttribute("organization.id", orgId);
  const rows = await listSpaces(db, orgId);

  spacesRequestsCompleted.add(1, { method: "GET", outcome: "success" });
  span.setAttributes({ outcome: "success", "spaces.count": rows.length });
  emitWebInfo("spaces listed", {
    "organization.id": orgId,
    "spaces.count": rows.length,
    outcome: "success",
  });
  return Response.json({
    spaces: rows.map((r) => ({
      ...r.space,
      workspaceName: r.workspace.name,
      workspaceTeamId: r.workspace.externalWorkspaceId,
    })),
  });
  }, { tracer: webTracer });
}

export async function POST(request: Request) {
  return await withSpan("spaces.create", async (span) => {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();

  const body = (await request.json()) as {
    organizationId?: string;
    workspaceId?: string;
    externalSpaceId: string;
    name: string;
    slug: string;
    modelId: string;
    instructions: string;
    enabledTools?: string[];
    runtimeMode?: string;
  };

  const db = getDb();
  const orgId = body.organizationId ?? await getDefaultOrgId(db);
  span.setAttributes({
    "organization.id": orgId,
    "space.slug": body.slug,
    "model.id": body.modelId,
  });

  let workspaceId = body.workspaceId;
  if (!workspaceId) {
    const ws = await db.select().from(workspaces).where(eq(workspaces.organizationId, orgId)).limit(1);
    workspaceId = ws[0]?.id;
  }
  if (!workspaceId) {
    spacesRequestsCompleted.add(1, { method: "POST", outcome: "validation_error" });
    span.setAttribute("outcome", "validation_error");
    return Response.json({ error: "No workspace found" }, { status: 400 });
  }

  const result = await createSpaceWithConfig(db, {
    organizationId: orgId,
    workspaceId,
    externalSpaceId: body.externalSpaceId,
    name: body.name,
    slug: body.slug,
    modelId: body.modelId,
    instructions: body.instructions,
    enabledTools: body.enabledTools,
    runtimeMode: "opencode",
  });

  spacesRequestsCompleted.add(1, { method: "POST", outcome: "success" });
  span.setAttributes({
    "workspace.id": workspaceId,
    "space.id": result.spaceId,
    outcome: "success",
  });
  emitWebInfo("space created", {
    "organization.id": orgId,
    "workspace.id": workspaceId,
    "space.id": result.spaceId,
    outcome: "success",
  });
  return Response.json(result, { status: 201 });
  }, { tracer: webTracer });
}

async function getDefaultOrgId(db: ReturnType<typeof getDb>) {
  const orgsWithSpaces = await db
    .select({ id: organizations.id })
    .from(organizations)
    .innerJoin(spaces, eq(spaces.organizationId, organizations.id))
    .limit(1);
  if (orgsWithSpaces[0]?.id) return orgsWithSpaces[0].id;

  const rows = await db.select().from(organizations).limit(1);
  return rows[0]?.id ?? "";
}
