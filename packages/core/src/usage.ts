import { and, count, desc, eq, gte, sum } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, runs, usageRecords } from "@tags/db";

/**
 * Micro-USD per 1M tokens for Fireworks models used by Tags.
 * GLM 5.2 Fast serverless: $2.10 input / $0.21 cached input / $6.60 output.
 * @see https://fireworks.ai/blog/glm-5p2-fast
 */
type ModelCostRates = { input: number; cachedInput: number; output: number };

const MODEL_COST_RATES: Record<string, ModelCostRates> = {
  "accounts/fireworks/routers/glm-5p2-fast": {
    input: 2_100_000,
    cachedInput: 210_000,
    output: 6_600_000,
  },
};

const DEFAULT_COST_RATES: ModelCostRates = {
  input: 2_100_000,
  cachedInput: 210_000,
  output: 6_600_000,
};

export type UsageCostInput = {
  promptTokens: number;
  completionTokens: number;
  /** Fresh input tokens when known (e.g. opencode step_finish tokens.input). */
  freshInputTokens?: number;
  /** Prompt-cache write tokens billed at the fresh input rate. */
  cacheWriteTokens?: number;
  /** Prompt-cache read tokens billed at the cached input rate. */
  cachedReadTokens?: number;
  /** Provider-reported run cost in micro-USD (e.g. opencode step_finish part.cost). */
  providerCostMicroUsd?: number;
};

function estimateCostMicroUsd(modelId: string, billing: UsageCostInput): number {
  if (billing.providerCostMicroUsd != null && billing.providerCostMicroUsd > 0) {
    return Math.round(billing.providerCostMicroUsd);
  }

  const knownRate = MODEL_COST_RATES[modelId];
  if (!knownRate) {
    console.warn(
      `[usage] Unknown model "${modelId}" — using estimated cost rates (input=${DEFAULT_COST_RATES.input}, cachedInput=${DEFAULT_COST_RATES.cachedInput}, output=${DEFAULT_COST_RATES.output} micro-USD per 1M tokens). Add an entry to MODEL_COST_RATES for accurate budget tracking.`,
    );
  }
  const rate = knownRate ?? DEFAULT_COST_RATES;

  const cachedRead = Math.max(0, billing.cachedReadTokens ?? 0);
  const cacheWrite = Math.max(0, billing.cacheWriteTokens ?? 0);
  const freshInput =
    billing.freshInputTokens != null
      ? Math.max(0, billing.freshInputTokens)
      : Math.max(0, billing.promptTokens - cachedRead - cacheWrite);

  return Math.round(
    (freshInput * rate.input +
      cacheWrite * rate.input +
      cachedRead * rate.cachedInput +
      billing.completionTokens * rate.output) /
      1_000_000,
  );
}

export { estimateCostMicroUsd };

export function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfUtcDaysAgo(days: number): Date {
  const today = startOfUtcDay(new Date());
  const start = new Date(today);
  start.setUTCDate(today.getUTCDate() - (Math.max(1, days) - 1));
  return start;
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
    freshInputTokens?: number;
    cacheWriteTokens?: number;
    cachedReadTokens?: number;
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
    costMicroUsd: estimateCostMicroUsd(args.modelId, {
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      freshInputTokens: args.freshInputTokens,
      cacheWriteTokens: args.cacheWriteTokens,
      cachedReadTokens: args.cachedReadTokens,
      providerCostMicroUsd: args.costMicroUsd,
    }),
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

export async function getSpaceUsageInWindow(
  db: Db,
  spaceId: string,
  days: number,
): Promise<{ totalTokens: number; costMicroUsd: number; runCount: number }> {
  const start = startOfUtcDaysAgo(days);
  const agg = await db
    .select({
      totalTokens: sum(usageRecords.totalTokens),
      costMicroUsd: sum(usageRecords.costMicroUsd),
      runCount: count(),
    })
    .from(usageRecords)
    .where(and(eq(usageRecords.spaceId, spaceId), gte(usageRecords.createdAt, start)));

  return {
    totalTokens: Number(agg[0]?.totalTokens ?? 0),
    costMicroUsd: Number(agg[0]?.costMicroUsd ?? 0),
    runCount: Number(agg[0]?.runCount ?? 0),
  };
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
