import { and, count, desc, eq, gte, sum } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, usageRecords } from "@tags/db";

/**
 * Micro-USD per 1M tokens. Keys must match Fireworks model ids used by spaces.
 * Unknown models fall back to DEFAULT_COST_RATES with a warning — budget enforcement
 * then uses that estimate rather than silently pretending the rate is known.
 */
const MODEL_COST_RATES: Record<string, { input: number; output: number }> = {
  "accounts/fireworks/models/kimi-k2-instruct": { input: 60_000, output: 250_000 },
  "accounts/fireworks/routers/glm-5p2-fast": { input: 100_000, output: 200_000 },
  "openai/gpt-4o-mini": { input: 150_000, output: 600_000 },
  "openai/gpt-4o": { input: 2_500_000, output: 10_000_000 },
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
