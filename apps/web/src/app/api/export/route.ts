import { listAuditEvents } from "@tags/core/audit";
import { loadSpaceMemoryFile, memoryUsage } from "@tags/core/file-memory";
import { getSpaceById } from "@tags/core/spaces-admin";
import { organizations } from "@tags/db";
import { getTextObjectWithEtag, spaceMemoryManifestObjectKey } from "@tags/storage";
import { getEnv } from "@/env";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { createR2ClientFromEnv } from "@/lib/r2";

export const runtime = "nodejs";

async function readMemoryManifest(
  r2: NonNullable<ReturnType<typeof createR2ClientFromEnv>>,
  organizationId: string,
  spaceId: string,
) {
  const object = await getTextObjectWithEtag(
    r2.client,
    r2.config,
    spaceMemoryManifestObjectKey(organizationId, spaceId),
  );
  if (object.status === "not_found") return null;
  try {
    return JSON.parse(object.body) as unknown;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();
  const db = getDb();
  const rows = await db.select().from(organizations).limit(1);
  const orgId = rows[0]?.id;
  if (!orgId) return Response.json({ error: "No org" }, { status: 400 });

  const url = new URL(request.url);
  const spaceId = url.searchParams.get("spaceId");

  let memory: unknown = null;
  if (spaceId) {
    const space = await getSpaceById(db, spaceId);
    if (!space) return Response.json({ error: "Space not found" }, { status: 404 });

    const r2 = createR2ClientFromEnv(getEnv());
    if (!r2) {
      memory = { configured: false, entries: [], raw: "", manifest: null };
    } else {
      const file = await loadSpaceMemoryFile(r2, {
        organizationId: space.organizationId,
        spaceId,
      });
      memory = {
        configured: true,
        entries: file.entries,
        raw: file.raw,
        etag: file.etag,
        usage: memoryUsage(file),
        manifest: await readMemoryManifest(r2, space.organizationId, spaceId),
      };
    }
  }

  const audit = await listAuditEvents(db, orgId, 500);

  return Response.json({
    exportedAt: new Date().toISOString(),
    organizationId: orgId,
    spaceId,
    memory,
    auditEvents: audit,
  });
}
