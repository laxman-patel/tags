"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
    <div className="max-w-3xl">
      <p className="mb-4 text-sm text-muted-foreground">
        Channel-scoped facts and preferences the agent has saved.
      </p>

      {memories === null && (
        <div className="grid gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      )}

      {memories !== null && memories.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">No memories yet</p>
            <p className="mt-1 mb-0 text-sm text-muted-foreground">
              Ask the agent to remember something in Slack and it will show up here.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {memories?.map((m) => (
          <Card key={m.id} size="sm">
            <CardContent className="flex items-start justify-between gap-4">
              <div>
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
    </div>
  );
}
