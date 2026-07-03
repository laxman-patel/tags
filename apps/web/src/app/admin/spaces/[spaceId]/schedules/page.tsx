"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MinimalCard,
  MinimalCardDescription,
  MinimalCardTitle,
} from "@/components/ui/minimal-card";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";

type ScheduleRow = {
  id: string;
  cron: string;
  prompt: string;
  timezone?: string;
  enabled?: boolean;
  nextRunAt?: string | null;
};

export default function SpaceSchedulesPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [schedules, setSchedules] = useState<ScheduleRow[] | null>(null);
  const [cron, setCron] = useState("0 9 * * *");
  const [prompt, setPrompt] = useState("Daily digest: summarize open threads");
  const [creating, setCreating] = useState(false);

  async function load() {
    if (!spaceId) return;
    const res = await fetch(`/api/schedules/${spaceId}`);
    const data = await res.json();
    setSchedules(data.schedules ?? []);
  }

  useEffect(() => {
    load();
  }, [spaceId]);

  async function create() {
    setCreating(true);
    try {
      await fetch(`/api/schedules/${spaceId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: "",
          cron,
          timezone: "UTC",
          prompt,
        }),
      });
      await load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-10">
      <PageHeader
        title="Schedules"
        description="Recurring prompts that run in this Space."
        backHref={`/admin/spaces/${spaceId}`}
        backLabel="Space"
      />

      {schedules === null && (
        <div className="h-20 animate-pulse rounded-[24px] bg-neutral-900" />
      )}

      {schedules !== null && schedules.length === 0 && (
        <MinimalCard className="p-8 text-center">
          <MinimalCardTitle className="mt-0 text-base">No schedules yet</MinimalCardTitle>
          <MinimalCardDescription className="mt-1 pb-0">
            Add a recurring prompt below and it will run on the cron you set.
          </MinimalCardDescription>
        </MinimalCard>
      )}

      <div className="grid gap-3">
        {schedules?.map((s) => (
          <MinimalCard key={s.id} className="p-4">
            <div className="flex items-center gap-2">
              <code className="text-xs">{s.cron}</code>
              {s.timezone && <Badge variant="outline">{s.timezone}</Badge>}
              {s.enabled === false && <Badge variant="destructive">disabled</Badge>}
            </div>
            <p className="mt-2 mb-0 text-sm leading-relaxed">{s.prompt}</p>
          </MinimalCard>
        ))}
      </div>

      <MinimalCard className="mt-6 p-5">
        <MinimalCardTitle className="mt-0 text-base">New schedule</MinimalCardTitle>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cron">Cron (UTC)</Label>
            <Input
              id="cron"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="0 9 * * *"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <Button onClick={create} disabled={creating}>
              {creating ? "Adding…" : "Add schedule"}
            </Button>
          </div>
        </div>
      </MinimalCard>
    </main>
  );
}
