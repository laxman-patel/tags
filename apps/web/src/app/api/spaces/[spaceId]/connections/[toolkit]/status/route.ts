import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { getSpaceById } from "@tags/core/spaces-admin";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getEnv } from "@/env";
import { getDb } from "@/lib/db";
import { COMPOSIO_TOOLKITS, toolkitLabel } from "@/lib/space-options";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spaceId: string; toolkit: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();

  const { spaceId, toolkit } = await params;
  const db = getDb();
  const space = await getSpaceById(db, spaceId);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });

  const known = COMPOSIO_TOOLKITS.some((entry) => entry.id === toolkit);
  if (!known) return Response.json({ error: `Unknown toolkit ${toolkit}` }, { status: 404 });

  const config = await loadActiveSpaceConfig(db, spaceId);
  const enabled = config?.enabledConnections.includes(toolkit) ?? false;
  const hasComposioApiKey = Boolean(getEnv().COMPOSIO_API_KEY);

  return Response.json({
    toolkit,
    label: toolkitLabel(toolkit),
    entityId: spaceId,
    enabled,
    hasComposioApiKey,
    status: !hasComposioApiKey ? "missing_api_key" : enabled ? "enabled" : "available",
  });
}
