import { recordAuditEvent } from "@tags/core/audit";
import { getSpaceById } from "@tags/core/spaces-admin";
import { authorizeComposioToolkit } from "@tags/runtime/tools/composio";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getEnv } from "@/env";
import { getDb } from "@/lib/db";
import { COMPOSIO_TOOLKITS } from "@/lib/space-options";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ spaceId: string; toolkit: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();

  const { spaceId, toolkit } = await params;
  const known = COMPOSIO_TOOLKITS.some((entry) => entry.id === toolkit);
  if (!known) return Response.json({ error: `Unknown toolkit ${toolkit}` }, { status: 404 });

  const env = getEnv();
  if (!env.COMPOSIO_API_KEY) {
    return Response.json({ error: "COMPOSIO_API_KEY is not configured" }, { status: 400 });
  }

  const db = getDb();
  const space = await getSpaceById(db, spaceId);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });

  const { connectUrl } = await authorizeComposioToolkit({
    apiKey: env.COMPOSIO_API_KEY,
    entityId: spaceId,
    toolkit,
  });

  await recordAuditEvent(db, {
    organizationId: space.organizationId,
    spaceId,
    actorType: "human",
    eventType: "connection.connect_requested",
    payload: { provider: "composio", toolkit, hasConnectUrl: Boolean(connectUrl) },
  });

  return Response.json({
    toolkit,
    entityId: spaceId,
    connectUrl,
  });
}
