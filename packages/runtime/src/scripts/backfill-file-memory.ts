import { asc, and, eq, isNull } from "drizzle-orm";
import { createDb, memories, spaces } from "@tags/db";
import {
  createR2Client,
  getR2ConfigFromProcessEnv,
  putTextObjectConditional,
  spaceMemoryObjectKey,
  spaceMemoryPrefix,
} from "@tags/storage";
import { renderMemoryFile, DEFAULT_MEMORY_CHAR_LIMIT } from "@tags/core/file-memory";

function normalize(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function uniqueEntries(contents: string[]): string[] {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const content of contents) {
    const normalized = normalize(content);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    entries.push(normalized);
  }
  return entries;
}

function packEntries(contents: string[], limit: number): { packed: string[]; overflow: string[] } {
  const packed: string[] = [];
  const overflow: string[] = [];
  for (const content of contents) {
    const candidate = [...packed, content];
    const body = candidate.join("\n§\n");
    if (body.length <= limit) {
      packed.push(content);
    } else {
      overflow.push(content);
    }
  }
  return { packed, overflow };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const r2Config = getR2ConfigFromProcessEnv();
  if (!r2Config) throw new Error("R2 configuration is required");

  const db = createDb(databaseUrl);
  const client = createR2Client(r2Config);
  const spaceRows = await db.select().from(spaces);

  for (const space of spaceRows) {
    const rows = await db
      .select()
      .from(memories)
      .where(and(eq(memories.spaceId, space.id), isNull(memories.deletedAt)))
      .orderBy(asc(memories.createdAt));

    if (rows.length === 0) continue;

    const entries = uniqueEntries(rows.map((row) => row.content));
    const { packed, overflow } = packEntries(entries, DEFAULT_MEMORY_CHAR_LIMIT);
    const key = spaceMemoryObjectKey(space.organizationId, space.id);
    const raw = renderMemoryFile(
      packed.map((content) => ({ content })),
      DEFAULT_MEMORY_CHAR_LIMIT,
    );

    const result = await putTextObjectConditional(client, r2Config, key, raw, {
      ifNoneMatch: "*",
      contentType: "text/markdown; charset=utf-8",
    });

    if (result.status === "conflict") {
      console.log(`Skipped ${space.id}: MEMORY.md already exists`);
      continue;
    }

    if (overflow.length > 0) {
      const overflowKey = `${spaceMemoryPrefix(space.organizationId, space.id)}/overflow/${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.md`;
      await putTextObjectConditional(
        client,
        r2Config,
        overflowKey,
        overflow.join("\n§\n"),
        { ifNoneMatch: "*", contentType: "text/markdown; charset=utf-8" },
      );
    }

    console.log(`Backfilled ${space.id}: ${packed.length} entries, ${overflow.length} overflow`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
