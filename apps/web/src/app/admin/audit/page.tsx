"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type AuditRow = {
  id: string | number;
  eventType: string;
  createdAt: string;
  payload: unknown;
};

export default function AuditPage() {
  const [events, setEvents] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    fetch("/api/audit")
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []));
  }, []);

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every governed event recorded for your organization.
          </p>
        </div>
        <a className={buttonVariants({ variant: "outline", size: "sm" })} href="/api/export">
          Export JSON
        </a>
      </div>

      {events === null && (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      )}

      {events !== null && events.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">No events yet</p>
            <p className="mt-1 mb-0 text-sm text-muted-foreground">
              Audit events are recorded as spaces, runs, and approvals change.
            </p>
          </CardContent>
        </Card>
      )}

      {events !== null && events.length > 0 && (
        <Card size="sm">
          <CardContent>
            <div className="divide-y divide-border/60">
              {events.map((e) => (
                <details key={String(e.id)} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded px-1 py-2.5 transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                    <code className="text-xs">{e.eventType}</code>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                  </summary>
                  <pre className="mx-1 mb-2 overflow-x-auto rounded-md border border-border/60 bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
