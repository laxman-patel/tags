"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
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
    <div className="grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-4 text-sm text-muted-foreground">
          Recurring prompts that run in this Space.
        </p>

        {schedules === null && (
          <div className="h-20 animate-pulse rounded-lg border border-border bg-card" />
        )}

        {schedules !== null && schedules.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm font-medium">No schedules yet</p>
              <p className="mt-1 mb-0 text-sm text-muted-foreground">
                Add a recurring prompt and it will run on the cron you set.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3">
          {schedules?.map((s) => (
            <Card key={s.id} size="sm">
              <CardContent>
                <div className="flex items-center gap-2">
                  <code className="text-xs">{s.cron}</code>
                  {s.timezone && <Badge variant="outline">{s.timezone}</Badge>}
                  {s.enabled === false && <Badge variant="destructive">disabled</Badge>}
                </div>
                <p className="mt-2 mb-0 text-sm leading-relaxed">{s.prompt}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="h-fit">
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
              rows={3}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={create} disabled={creating}>
            {creating ? "Adding…" : "Add schedule"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
