"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";

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
    await fetch(`/api/memory/item/${id}`, { method: "DELETE" });
    setMemories((prev) => (prev ? prev.filter((m) => m.id !== id) : prev));
  }

  return (
    <div>
      <p className="mb-5 text-sm text-muted-foreground">
        Channel-scoped facts and preferences the agent has saved.
      </p>

      {memories === null && (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      )}

      {memories !== null && memories.length === 0 && (
        <EmptyState
          title="No memories yet"
          description="Ask the agent to remember something in Slack and it will show up here."
        />
      )}

      {memories !== null && memories.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {memories.map((m) => (
            <Card key={m.id} size="sm">
              <CardContent className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Badge variant="outline">{m.kind}</Badge>
                  <p className="mt-2 mb-0 text-sm leading-relaxed">{m.content}</p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => forget(m.id)}>
                  Forget
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
