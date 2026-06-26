import { and, count, desc, eq, gte, sum } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, usageRecords } from "@tags/db";

function estimateCostMicroUsd(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rates: Record<string, { input: number; output: number }> = {
    "openai/gpt-4o-mini": { input: 150_000, output: 600_000 },
    "openai/gpt-4o": { input: 2_500_000, output: 10_000_000 },
  };
  const rate = rates[modelId] ?? { input: 500_000, output: 1_500_000 };
  return Math.round(
    (promptTokens * rate.input + completionTokens * rate.output) / 1_000_000,
  );
}

export function startOfCurrentMonth(): Date {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function getMonthlySpendMicroUsd(db: Db, spaceId: string): Promise<number> {
  const agg = await db
    .select({ total: sum(usageRecords.costMicroUsd) })
    .from(usageRecords)
    .where(
      and(eq(usageRecords.spaceId, spaceId), gte(usageRecords.createdAt, startOfCurrentMonth())),
    );

  return Number(agg[0]?.total ?? 0);
}

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
    costMicroUsd:
      args.costMicroUsd ??
      estimateCostMicroUsd(args.modelId, args.promptTokens, args.completionTokens),
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
