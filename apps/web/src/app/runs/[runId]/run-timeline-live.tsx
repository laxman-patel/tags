"use client";

import { useEffect, useRef, useState } from "react";
import { RunTimeline } from "@tags/ui";

type TimelineEvent = {
  seq: number;
  eventType: string;
  payload: unknown;
  createdAt?: string;
};

const ACTIVE_STATUSES = new Set(["queued", "streaming", "waiting"]);

function maxSeq(events: TimelineEvent[]): number {
  return events.reduce((max, event) => Math.max(max, event.seq), 0);
}

export function RunTimelineLive(props: {
  runId: string;
  initialEvents: TimelineEvent[];
  initialStatus: string;
}) {
  const [events, setEvents] = useState(props.initialEvents);
  const [status, setStatus] = useState(props.initialStatus);
  const lastSeqRef = useRef(maxSeq(props.initialEvents));

  useEffect(() => {
    if (!ACTIVE_STATUSES.has(status)) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/runs/${props.runId}/events?afterSeq=${lastSeqRef.current}`,
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          status: string;
          events: TimelineEvent[];
        };
        if (cancelled) return;
        setStatus(data.status);
        if (data.events.length > 0) {
          lastSeqRef.current = Math.max(lastSeqRef.current, maxSeq(data.events));
          setEvents((prev) => {
            const seen = new Set(prev.map((event) => event.seq));
            const merged = [...prev];
            for (const event of data.events) {
              if (!seen.has(event.seq)) merged.push(event);
            }
            return merged.sort((a, b) => a.seq - b.seq);
          });
        }
      } catch {
        // ignore transient poll errors
      }
    };

    const interval = setInterval(poll, 2000);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [props.runId, status]);

  return (
    <div>
      {ACTIVE_STATUSES.has(status) && (
        <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-foreground" />
          Live — updating every 2s
        </p>
      )}
      <RunTimeline events={events} />
    </div>
  );
}
