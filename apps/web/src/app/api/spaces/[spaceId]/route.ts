import {
  createSpaceConfigVersion,
  getSpaceById,
  listSpaceConfigVersions,
} from "@tags/core/spaces-admin";
import { loadActiveSpaceConfig, parseRuntimeMode } from "@tags/core/spaces";
import { recordAuditEvent } from "@tags/core/audit";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";

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

  const config = await loadActiveSpaceConfig(db, spaceId);
  const versions = await listSpaceConfigVersions(db, spaceId);

  return Response.json({ space, activeConfig: config, versions });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();

  const { spaceId } = await params;
  const body = (await request.json()) as {
    modelId: string;
    instructions: string;
    enabledTools: string[];
    reasoning?: string;
    maxSteps?: number;
    runtimeMode?: string;
  };

  const db = getDb();
  const space = await getSpaceById(db, spaceId);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });

  const result = await createSpaceConfigVersion(db, {
    spaceId,
    organizationId: space.organizationId,
    modelId: body.modelId,
    instructions: body.instructions,
    enabledTools: body.enabledTools,
    reasoning: body.reasoning,
    maxSteps: body.maxSteps,
    runtimeMode: parseRuntimeMode(body.runtimeMode),
  });

  await recordAuditEvent(db, {
    organizationId: space.organizationId,
    spaceId,
    actorType: "human",
    eventType: "config.activated",
    payload: { version: result.version, modelId: body.modelId, runtimeMode: body.runtimeMode },
  });

  return Response.json(result);
}
