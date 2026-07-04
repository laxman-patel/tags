import {
  addMemoryEntry,
  loadSpaceMemoryFile,
  memoryUsage,
  MemoryConflictError,
  MemoryFullError,
  mutateSpaceMemoryFile,
  removeMemoryEntryBySubstring,
  replaceMemoryEntryBySubstring,
  writeRawSpaceMemoryFile,
} from "@tags/core/file-memory";
import { getSpaceById } from "@tags/core/spaces-admin";
import { getTextObjectWithEtag, spaceMemoryManifestObjectKey } from "@tags/storage";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { getEnv } from "@/env";
import { createR2ClientFromEnv } from "@/lib/r2";

export const runtime = "nodejs";

async function loadR2() {
  const env = getEnv();
  return createR2ClientFromEnv(env);
}

function memoryErrorResponse(error: unknown) {
  if (error instanceof MemoryConflictError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof MemoryFullError) {
    return Response.json(
      {
        error: error.message,
        usage: error.usage,
        currentEntries: error.entries,
      },
      { status: 400 },
    );
  }
  return Response.json(
    { error: error instanceof Error ? error.message : "Memory operation failed" },
    { status: 400 },
  );
}

async function readManifest(r2: NonNullable<ReturnType<typeof createR2ClientFromEnv>>, organizationId: string, spaceId: string) {
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();
  const { spaceId } = await params;
  const db = getDb();
  const space = await getSpaceById(db, spaceId);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });

  const r2 = await loadR2();
  if (!r2) return Response.json({ configured: false, entries: [], raw: "", manifest: null });

  const memory = await loadSpaceMemoryFile(r2, {
    organizationId: space.organizationId,
    spaceId,
  });
  const manifest = await readManifest(r2, space.organizationId, spaceId);
  return Response.json({
    configured: true,
    entries: memory.entries,
    raw: memory.raw,
    etag: memory.etag,
    charLimit: memory.charLimit,
    usage: memoryUsage(memory),
    manifest,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();
  const { spaceId } = await params;
  const db = getDb();
  const space = await getSpaceById(db, spaceId);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });

  const r2 = await loadR2();
  if (!r2) return Response.json({ error: "R2 memory storage is not configured" }, { status: 503 });

  const body = (await request.json()) as { raw?: string; etag?: string };
  if (typeof body.raw !== "string") {
    return Response.json({ error: "raw is required" }, { status: 400 });
  }

  try {
    const result = await writeRawSpaceMemoryFile(
      r2,
      {
        db,
        organizationId: space.organizationId,
        spaceId,
        actorType: "human",
        expectedEtag: body.etag,
      },
      body.raw,
    );
    return Response.json({
      ok: true,
      entries: result.memory.entries,
      raw: result.memory.raw,
      etag: result.memory.etag,
      usage: memoryUsage(result.memory),
      revisionId: result.revisionId,
    });
  } catch (error) {
    return memoryErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();
  const { spaceId } = await params;
  const db = getDb();
  const space = await getSpaceById(db, spaceId);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });

  const r2 = await loadR2();
  if (!r2) return Response.json({ error: "R2 memory storage is not configured" }, { status: 503 });

  const body = (await request.json()) as {
    action?: "add" | "replace" | "remove";
    content?: string;
    oldText?: string;
  };

  try {
    const context = {
      db,
      organizationId: space.organizationId,
      spaceId,
      actorType: "human" as const,
    };
    const action = body.action ?? "add";
    const result = await mutateSpaceMemoryFile(r2, context, (memory) => {
      if (action === "remove") {
        if (!body.oldText?.trim()) throw new Error("oldText is required");
        return removeMemoryEntryBySubstring(memory, body.oldText);
      }
      if (action === "replace") {
        if (!body.oldText?.trim()) throw new Error("oldText is required");
        if (!body.content?.trim()) throw new Error("content is required");
        return replaceMemoryEntryBySubstring(memory, body.oldText, body.content);
      }
      if (!body.content?.trim()) throw new Error("content is required");
      return addMemoryEntry(memory, body.content);
    });

    return Response.json({
      ok: true,
      action,
      duplicate: result.duplicate ?? false,
      entries: result.memory.entries,
      raw: result.memory.raw,
      etag: result.memory.etag,
      usage: memoryUsage(result.memory),
      revisionId: result.revisionId,
    });
  } catch (error) {
    return memoryErrorResponse(error);
  }
}
