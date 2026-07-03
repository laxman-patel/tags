"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MinimalCard,
  MinimalCardDescription,
  MinimalCardTitle,
} from "@/components/ui/minimal-card";
import { PageHeader } from "@/components/page-header";

type MemoryRow = {
  id: string;
  kind: string;
  content: string;
  createdAt?: string;
};

export default function SpaceMemoryPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [memories, setMemories] = useState<MemoryRow[] | null>(null);

  useEffect(() => {
    if (!spaceId) return;
    fetch(`/api/memory/${spaceId}`)
      .then((r) => r.json())
      .then((d) => setMemories(d.memories ?? []));
  }, [spaceId]);

  async function forget(id: string) {
    await fetch(`/api/memory/item/${id}`, {
      method: "DELETE",
    });
    setMemories((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
  }

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-10">
      <PageHeader
        title="Space memory"
        description="Channel-scoped facts and preferences the agent has saved."
        backHref={`/admin/spaces/${spaceId}`}
        backLabel="Space"
      />

      {memories === null && (
        <div className="grid gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-[24px] bg-neutral-900" />
          ))}
        </div>
      )}

      {memories !== null && memories.length === 0 && (
        <MinimalCard className="p-8 text-center">
          <MinimalCardTitle className="mt-0 text-base">No memories yet</MinimalCardTitle>
          <MinimalCardDescription className="mt-1 pb-0">
            Ask the agent to remember something in Slack and it will show up here.
          </MinimalCardDescription>
        </MinimalCard>
      )}

      <div className="grid gap-3">
        {memories?.map((m) => (
          <MinimalCard key={m.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Badge variant="outline">{m.kind}</Badge>
                <p className="mt-2 mb-0 text-sm leading-relaxed">{m.content}</p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => forget(m.id)}>
                Forget
              </Button>
            </div>
          </MinimalCard>
        ))}
      </div>
    </main>
  );
}
