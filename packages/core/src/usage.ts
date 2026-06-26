import { count, desc, eq, sum } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, usageRecords } from "@tags/db";

export async function recordUsage(
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    runId: string;
    modelId: string;
    provider?: string;
    promptTokens: number;
    completionTokens: number;
    costMicroUsd?: number;
  },
) {
  const total = args.promptTokens + args.completionTokens;
  const id = newId();
  await db.insert(usageRecords).values({
    id,
    organizationId: args.organizationId,
    spaceId: args.spaceId,
    runId: args.runId,
    modelId: args.modelId,
    provider: args.provider,
    promptTokens: args.promptTokens,
    completionTokens: args.completionTokens,
    totalTokens: total,
    costMicroUsd: args.costMicroUsd ?? 0,
  });
}

export async function getUsageBySpace(db: Db, spaceId: string) {
  const agg = await db
    .select({
      totalTokens: sum(usageRecords.totalTokens),
      costMicroUsd: sum(usageRecords.costMicroUsd),
      runCount: count(),
    })
    .from(usageRecords)
    .where(eq(usageRecords.spaceId, spaceId));

  const recent = await db
    .select()
    .from(usageRecords)
    .where(eq(usageRecords.spaceId, spaceId))
    .orderBy(desc(usageRecords.createdAt))
    .limit(50);

  return { summary: agg[0], recent };
}
