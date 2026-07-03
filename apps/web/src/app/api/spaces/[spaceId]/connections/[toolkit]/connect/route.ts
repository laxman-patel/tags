import { Composio } from "@composio/core";
import { recordAuditEvent } from "@tags/core/audit";
import { getSpaceById } from "@tags/core/spaces-admin";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getEnv } from "@/env";
import { getDb } from "@/lib/db";
import { COMPOSIO_TOOLKITS } from "@/lib/space-options";

export const runtime = "nodejs";

function findConnectUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const candidates = [
    record.redirectUrl,
    record.redirect_url,
    record.authUrl,
    record.auth_url,
    record.connectUrl,
    record.connect_url,
    record.url,
    (record.connectionRequest as Record<string, unknown> | undefined)?.redirectUrl,
    (record.connectionRequest as Record<string, unknown> | undefined)?.redirect_url,
  ];
  return candidates.find((candidate): candidate is string => typeof candidate === "string") ?? null;
}

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

  const composio = new Composio({ apiKey: env.COMPOSIO_API_KEY });
  const session = await composio.create(spaceId, {
    mcp: true,
    toolkits: [toolkit],
  });
  const connectUrl = findConnectUrl(session);

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
    // Keep headers/secrets out of the response; the UI only needs the user-facing URL/status.
    sessionAvailable: Boolean(session),
  });
}
