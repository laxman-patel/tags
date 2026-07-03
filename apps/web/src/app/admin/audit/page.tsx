"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  MinimalCard,
  MinimalCardDescription,
  MinimalCardTitle,
} from "@/components/ui/minimal-card";
import { PageHeader } from "@/components/page-header";

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
    <main className="mx-auto w-full max-w-[900px] px-4 py-10">
      <PageHeader
        title="Audit log"
        description="Every governed event recorded for your organization."
        backHref="/admin/spaces"
        backLabel="Admin"
        actions={
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href="/api/export">
            Export JSON
          </a>
        }
      />

      {events === null && (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-[24px] bg-neutral-900" />
          ))}
        </div>
      )}

      {events !== null && events.length === 0 && (
        <MinimalCard className="p-8 text-center">
          <MinimalCardTitle className="mt-0 text-base">No events yet</MinimalCardTitle>
          <MinimalCardDescription className="mt-1 pb-0">
            Audit events are recorded as spaces, runs, and approvals change.
          </MinimalCardDescription>
        </MinimalCard>
      )}

      {events !== null && events.length > 0 && (
        <MinimalCard className="p-2">
          <div className="divide-y divide-border/60">
            {events.map((e) => (
              <details key={String(e.id)} className="group px-2 py-1">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-2 transition-colors hover:bg-neutral-800/40 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  <code className="text-xs">{e.eventType}</code>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                </summary>
                <pre className="mx-1 mb-2 overflow-x-auto rounded-lg border border-border/60 bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {JSON.stringify(e.payload, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </MinimalCard>
      )}
    </main>
  );
}
