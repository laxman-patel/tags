import { eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { artifacts, newId } from "@tags/db";

export async function createArtifact(
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    threadId: string;
    runId: string;
    kind: "markdown" | "html" | "diff" | "image" | "table" | "json" | "link";
    title: string;
    url: string;
    body?: string;
    contentType?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const id = newId();
  const [row] = await db
    .insert(artifacts)
    .values({
      id,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      threadId: args.threadId,
      runId: args.runId,
      kind: args.kind,
      title: args.title,
      url: args.url,
      body: args.body,
      contentType: args.contentType ?? "text/markdown",
      sizeBytes: args.body ? Buffer.byteLength(args.body, "utf8") : 0,
      metadata: args.metadata,
    })
    .returning();
  return row;
}

export async function getArtifactById(db: Db, artifactId: string) {
  const rows = await db.select().from(artifacts).where(eq(artifacts.id, artifactId)).limit(1);
  return rows[0];
}

export async function listArtifactsForRun(db: Db, runId: string) {
  return db.select().from(artifacts).where(eq(artifacts.runId, runId));
}
