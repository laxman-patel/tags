import { and, count, desc, eq, gte, sum } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, runs, usageRecords } from "@tags/db";

/**
 * Micro-USD per 1M tokens for GLM 5.2 Fast (Tags' only inference model).
 */
const MODEL_COST_RATES: Record<string, { input: number; output: number }> = {
  "accounts/fireworks/routers/glm-5p2-fast": { input: 100_000, output: 200_000 },
};

const DEFAULT_COST_RATES = { input: 500_000, output: 1_500_000 };

function estimateCostMicroUsd(
  modelId: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const knownRate = MODEL_COST_RATES[modelId];
  if (!knownRate) {
    console.warn(
      `[usage] Unknown model "${modelId}" — using estimated cost rates (input=${DEFAULT_COST_RATES.input}, output=${DEFAULT_COST_RATES.output} micro-USD per 1M tokens). Add an entry to MODEL_COST_RATES for accurate budget tracking.`,
    );
  }
  const rate = knownRate ?? DEFAULT_COST_RATES;
  return Math.round(
    (promptTokens * rate.input + completionTokens * rate.output) / 1_000_000,
  );
}

export { estimateCostMicroUsd };

export function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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

export async function getOrgMonthlySpendMicroUsd(
  db: Db,
  organizationId: string,
): Promise<number> {
  const agg = await db
    .select({ total: sum(usageRecords.costMicroUsd) })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.organizationId, organizationId),
        gte(usageRecords.createdAt, startOfCurrentMonth()),
      ),
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

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dayKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

export async function getSpaceDailyUsage(
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    days?: number;
  },
) {
  const days = Math.max(1, args.days ?? 7);
  const today = startOfUtcDay(new Date());
  const start = new Date(today);
  start.setUTCDate(today.getUTCDate() - (days - 1));

  const buckets = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      runs: 0,
      tokens: 0,
    };
  });
  const bucketByDate = new Map(buckets.map((bucket) => [bucket.date, bucket]));

  const [runRows, usageRows] = await Promise.all([
    db
      .select({ startedAt: runs.startedAt })
      .from(runs)
      .where(
        and(
          eq(runs.organizationId, args.organizationId),
          eq(runs.spaceId, args.spaceId),
          gte(runs.startedAt, start),
        ),
      ),
    db
      .select({
        createdAt: usageRecords.createdAt,
        totalTokens: usageRecords.totalTokens,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.organizationId, args.organizationId),
          eq(usageRecords.spaceId, args.spaceId),
          gte(usageRecords.createdAt, start),
        ),
      ),
  ]);

  for (const row of runRows) {
    const bucket = bucketByDate.get(dayKey(row.startedAt));
    if (bucket) bucket.runs += 1;
  }

  for (const row of usageRows) {
    const bucket = bucketByDate.get(dayKey(row.createdAt));
    if (bucket) bucket.tokens += Number(row.totalTokens ?? 0);
  }

  return buckets;
}
