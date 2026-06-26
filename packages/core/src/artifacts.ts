import { eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { artifacts } from "@tags/db";
import type { ArtifactBodyReadResult } from "@tags/storage";

export async function createArtifact(
  db: Db,
  args: {
    id: string;
    organizationId: string;
    spaceId: string;
    threadId: string;
    runId: string;
    kind: "markdown" | "html" | "diff" | "image" | "table" | "json" | "link";
    title: string;
    url: string;
    body?: string;
    contentRef?: string;
    contentType?: string;
    sizeBytes?: number;
    metadata?: Record<string, unknown>;
  },
) {
  const [row] = await db
    .insert(artifacts)
    .values({
      id: args.id,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      threadId: args.threadId,
      runId: args.runId,
      kind: args.kind,
      title: args.title,
      url: args.url,
      body: args.body,
      contentRef: args.contentRef,
      contentType: args.contentType ?? "text/markdown",
      sizeBytes:
        args.sizeBytes ??
        (args.body ? Buffer.byteLength(args.body, "utf8") : 0),
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

export type ResolvedArtifactBody = {
  body: string | null;
  /** True when content was expected (e.g. contentRef) but could not be loaded. */
  unavailable: boolean;
};

export async function resolveArtifactBody(
  artifact: NonNullable<Awaited<ReturnType<typeof getArtifactById>>>,
  fetchFromR2?: (contentRef: string) => Promise<ArtifactBodyReadResult>,
): Promise<ResolvedArtifactBody> {
  if (artifact.body != null) {
    return { body: artifact.body, unavailable: false };
  }
  if (artifact.contentRef && fetchFromR2) {
    const result = await fetchFromR2(artifact.contentRef);
    switch (result.status) {
      case "found":
        return { body: result.body, unavailable: false };
      case "not_found":
      case "error":
        return { body: null, unavailable: true };
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  }
  return { body: null, unavailable: false };
}
