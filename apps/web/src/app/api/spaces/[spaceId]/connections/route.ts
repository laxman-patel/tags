import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { getSpaceById } from "@tags/core/spaces-admin";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getEnv } from "@/env";
import { getDb } from "@/lib/db";
import { COMPOSIO_TOOLKITS } from "@/lib/space-options";

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
  const enabled = new Set(config?.enabledConnections ?? []);
  const hasComposioApiKey = Boolean(getEnv().COMPOSIO_API_KEY);

  return Response.json({
    entityId: spaceId,
    hasComposioApiKey,
    enabledConnections: config?.enabledConnections ?? [],
    toolkits: COMPOSIO_TOOLKITS.map((toolkit) => ({
      ...toolkit,
      enabled: enabled.has(toolkit.id),
      status: !hasComposioApiKey ? "missing_api_key" : enabled.has(toolkit.id) ? "enabled" : "available",
    })),
  });
}
