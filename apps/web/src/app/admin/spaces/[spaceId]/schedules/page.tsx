"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";

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
    <div>
      <p className="mb-5 text-sm text-muted-foreground">
        Recurring prompts that run automatically in this Space.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {schedules === null && (
            <div className="grid gap-3">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg border border-border bg-card"
                />
              ))}
            </div>
          )}

          {schedules !== null && schedules.length === 0 && (
            <EmptyState
              title="No schedules yet"
              description="Add a recurring prompt from the form and it will run on the cron you set."
            />
          )}

          {schedules !== null && schedules.length > 0 && (
            <div className="grid gap-3">
              {schedules.map((s) => (
                <Card key={s.id} size="sm">
                  <CardContent className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
                      <Clock className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="text-xs">{s.cron}</code>
                        {s.timezone && <Badge variant="outline">{s.timezone}</Badge>}
                        {s.enabled === false && <Badge variant="destructive">disabled</Badge>}
                      </div>
                      <p className="mt-1.5 mb-0 text-sm leading-relaxed">{s.prompt}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>New schedule</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
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
                rows={4}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={create} disabled={creating} className="w-full">
              {creating ? "Adding…" : "Add schedule"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
