"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import {
  MinimalCard,
  MinimalCardDescription,
  MinimalCardTitle,
} from "@/components/ui/minimal-card";
import { PageHeader } from "@/components/page-header";

type Usage = {
  summary: {
    totalTokens: string | number | null;
    costMicroUsd: string | number | null;
    runCount: string | number | null;
  };
  recent: Array<{
    id: string;
    runId: string;
    modelId: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costMicroUsd: number;
    createdAt: string;
  }>;
};

function StatCard(props: { label: string; value: number; format?: (v: number) => string }) {
  return (
    <MinimalCard className="p-4">
      <MinimalCardDescription className="pb-0">{props.label}</MinimalCardDescription>
      <div className="mt-1 px-1 text-2xl font-semibold tracking-tight tabular-nums">
        <AnimatedNumber value={props.value} format={props.format} precision={props.format ? 2 : 0} />
      </div>
    </MinimalCard>
  );
}

export default function SpaceUsagePage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (!spaceId) return;
    fetch(`/api/usage/${spaceId}`)
      .then((r) => r.json())
      .then(setUsage);
  }, [spaceId]);

  const runCount = Number(usage?.summary?.runCount ?? 0);
  const totalTokens = Number(usage?.summary?.totalTokens ?? 0);
  const costUsd = Number(usage?.summary?.costMicroUsd ?? 0) / 1_000_000;

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-10">
      <PageHeader
        title="Usage & spend"
        description="Aggregate model usage recorded for this Space."
        backHref={`/admin/spaces/${spaceId}`}
        backLabel="Space"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Runs" value={runCount} />
        <StatCard label="Total tokens" value={totalTokens} />
        <StatCard label="Cost (USD)" value={costUsd} format={(v) => `$${v.toFixed(2)}`} />
      </div>

      <div className="mt-6">
        {usage !== null && usage.recent.length === 0 && (
          <MinimalCard className="p-8 text-center">
            <MinimalCardTitle className="mt-0 text-base">No usage yet</MinimalCardTitle>
            <MinimalCardDescription className="mt-1 pb-0">
              Usage records appear after the first run in this Space.
            </MinimalCardDescription>
          </MinimalCard>
        )}

        {usage !== null && usage.recent.length > 0 && (
          <MinimalCard className="p-2">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Model</th>
                  <th className="px-3 py-2.5 text-right font-medium">Prompt</th>
                  <th className="px-3 py-2.5 text-right font-medium">Completion</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cost</th>
                  <th className="px-3 py-2.5 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {usage.recent.map((r) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-3 py-2.5 font-mono text-xs">{r.modelId}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.promptTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.completionTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.totalTokens.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      ${(r.costMicroUsd / 1_000_000).toFixed(4)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </MinimalCard>
        )}
      </div>
    </main>
  );
}
