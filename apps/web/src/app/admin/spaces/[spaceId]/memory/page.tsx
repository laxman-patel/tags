"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type MemoryEntry = {
  content: string;
};

type MemoryData = {
  configured: boolean;
  entries: MemoryEntry[];
  raw: string;
  etag?: string;
  usage?: { used: number; limit: number; percent: number };
  manifest?: unknown;
};

type HistoryItem = {
  revisionId: string;
  lastModified?: string;
  size?: number;
};

export default function SpaceMemoryPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [rawDraft, setRawDraft] = useState("");
  const [content, setContent] = useState("");
  const [oldText, setOldText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!spaceId) return;
    const [memoryRes, historyRes] = await Promise.all([
      fetch(`/api/memory/${spaceId}`),
      fetch(`/api/memory/${spaceId}/history`),
    ]);
    const memoryData = (await memoryRes.json()) as MemoryData;
    const historyData = (await historyRes.json()) as { history?: HistoryItem[] };
    setMemory(memoryData);
    setRawDraft(memoryData.raw ?? "");
    setHistory(historyData.history ?? []);
  }, [spaceId]);

  useEffect(() => {
    load().catch(() => setMessage("Failed to load memory"));
  }, [load]);

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/memory/${spaceId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setMessage(res.ok ? "Memory updated" : data.error ?? "Memory update failed");
      if (res.ok) await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveRaw() {
    setBusy(true);
    try {
      const res = await fetch(`/api/memory/${spaceId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw: rawDraft, etag: memory?.etag }),
      });
      const data = await res.json();
      setMessage(res.ok ? "Memory file saved" : data.error ?? "Memory save failed");
      if (res.ok) await load();
    } finally {
      setBusy(false);
    }
  }

  if (memory === null) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
    );
  }

  if (!memory.configured) {
    return (
      <EmptyState
        title="R2 memory is not configured"
        description="Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME to enable file-backed Space memory."
      />
    );
  }

  const usage = memory.usage ?? { used: 0, limit: 2200, percent: 0 };

  return (
    <div className="grid gap-6">
      <div>
        <p className="mb-3 text-sm text-muted-foreground">
          Hermes-style Space memory stored as MEMORY.md in R2.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {usage.used}/{usage.limit} chars
          </Badge>
          <Badge variant={usage.percent >= 90 ? "destructive" : "secondary"}>
            {usage.percent}%
          </Badge>
          {memory.etag && <Badge variant="outline">etag {memory.etag}</Badge>}
        </div>
        {message && <p className="mt-3 text-sm text-muted-foreground">{message}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entries</CardTitle>
          <CardDescription>Entries are separated by the section delimiter in MEMORY.md.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {memory.entries.length === 0 && (
            <EmptyState title="No memories yet" description="Ask Tags to remember something in Slack." />
          )}
          {memory.entries.map((entry, index) => (
            <div key={`${entry.content}-${index}`} className="rounded-lg border border-border p-3">
              <p className="mb-3 text-sm leading-relaxed">{entry.content}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setOldText(entry.content.slice(0, 80));
                    setContent(entry.content);
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => mutate({ action: "remove", oldText: entry.content.slice(0, 80) })}
                >
                  Forget
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entry Action</CardTitle>
          <CardDescription>Add an entry or replace an existing entry by unique substring.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="oldText">Match substring</Label>
            <Input
              id="oldText"
              value={oldText}
              onChange={(event) => setOldText(event.target.value)}
              placeholder="Only needed for replace"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Compact Space memory entry"
              rows={4}
            />
          </div>
          <div className="flex gap-2">
            <Button disabled={busy || !content.trim()} onClick={() => mutate({ action: "add", content })}>
              Add
            </Button>
            <Button
              variant="outline"
              disabled={busy || !oldText.trim() || !content.trim()}
              onClick={() => mutate({ action: "replace", oldText, content })}
            >
              Replace
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raw MEMORY.md</CardTitle>
          <CardDescription>Direct editor for the canonical R2 memory file.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Textarea value={rawDraft} onChange={(event) => setRawDraft(event.target.value)} rows={12} />
          <Button disabled={busy || rawDraft === memory.raw} onClick={saveRaw}>
            Save Markdown
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Immutable snapshots captured before memory rewrites.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No snapshots yet.</p>
          ) : (
            <div className="grid gap-2">
              {history.map((item) => (
                <div key={item.revisionId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="break-all font-mono">{item.revisionId}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {item.lastModified ? new Date(item.lastModified).toLocaleString() : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
