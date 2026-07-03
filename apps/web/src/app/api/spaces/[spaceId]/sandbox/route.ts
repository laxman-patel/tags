import { Sandbox } from "e2b";
import { eq, spaceSandboxSessions } from "@tags/db";
import { recordAuditEvent } from "@tags/core/audit";
import { getSpaceById } from "@tags/core/spaces-admin";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getEnv } from "@/env";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

async function loadSandbox(spaceId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(spaceSandboxSessions)
    .where(eq(spaceSandboxSessions.spaceId, spaceId))
    .limit(1);
  return rows[0] ?? null;
}

async function killExternalSandbox(sandboxId: string | null, apiKey?: string) {
  if (!sandboxId) return { attempted: false, killed: false };
  try {
    const connect = (Sandbox as unknown as {
      connect?: (id: string, options?: { apiKey?: string }) => Promise<{ kill: () => Promise<void> }>;
    }).connect;
    if (!connect) return { attempted: false, killed: false, error: "connect_unavailable" };
    const sandbox = await connect(sandboxId, { apiKey });
    await sandbox.kill();
    return { attempted: true, killed: true };
  } catch (error) {
    return {
      attempted: true,
      killed: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();

  const { spaceId } = await params;
  const db = getDb();
  const space = await getSpaceById(db, spaceId);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });

  const sandbox = await loadSandbox(spaceId);
  return Response.json({
    sandbox,
    hasE2bApiKey: Boolean(getEnv().E2B_API_KEY),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();

  const { spaceId } = await params;
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  const db = getDb();
  const space = await getSpaceById(db, spaceId);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });

  const sandbox = await loadSandbox(spaceId);
  if (!sandbox) {
    return Response.json({ reset: false, message: "No sandbox session exists for this Space." });
  }

  if (sandbox.activeRunId && !body.force) {
    return Response.json(
      { error: "Sandbox is leased by an active run. Pass force=true to reset anyway." },
      { status: 409 },
    );
  }

  const killResult = await killExternalSandbox(sandbox.externalSandboxId, getEnv().E2B_API_KEY);
  await db.delete(spaceSandboxSessions).where(eq(spaceSandboxSessions.id, sandbox.id));

  await recordAuditEvent(db, {
    organizationId: space.organizationId,
    spaceId,
    actorType: "human",
    eventType: "sandbox.reset",
    payload: {
      sandboxSessionId: sandbox.id,
      externalSandboxId: sandbox.externalSandboxId,
      force: Boolean(body.force),
      killResult,
    },
  });

  return Response.json({ reset: true, killResult });
}
