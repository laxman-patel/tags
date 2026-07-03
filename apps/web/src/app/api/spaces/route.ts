import { listSpaces, createSpaceWithConfig } from "@tags/core/spaces-admin";
import { parseRuntimeMode } from "@tags/core/spaces";
import { eq, organizations, spaces, workspaces } from "@tags/db";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();

  const db = getDb();
  const orgId = request.headers.get("x-tags-org-id") ?? await getDefaultOrgId(db);
  const rows = await listSpaces(db, orgId);

  return Response.json({
    spaces: rows.map((r) => ({
      ...r.space,
      workspaceName: r.workspace.name,
      workspaceTeamId: r.workspace.externalWorkspaceId,
    })),
  });
}

export async function POST(request: Request) {
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

  let workspaceId = body.workspaceId;
  if (!workspaceId) {
    const ws = await db.select().from(workspaces).where(eq(workspaces.organizationId, orgId)).limit(1);
    workspaceId = ws[0]?.id;
  }
  if (!workspaceId) {
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
    runtimeMode: parseRuntimeMode(body.runtimeMode),
  });

  return Response.json(result, { status: 201 });
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
