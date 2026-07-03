import type { TagsEvent } from "@tags/core/events";
import { EventRenderer } from "./event-renderer";
import { parseTagsEvent } from "./parse-event";

export function RunTimeline(props: {
  events: Array<{ seq: number; eventType: string; payload: unknown; createdAt?: string }>;
}) {
  return (
    <ol className="m-0 grid list-none gap-4 p-0">
      {props.events.map((row) => {
        const event = parseTagsEvent(row.eventType, row.payload);
        return (
          <li key={row.seq}>
            <div className="mb-1.5 font-mono text-xs text-muted-foreground">
              #{row.seq} · {row.eventType}
              {row.createdAt && ` · ${row.createdAt}`}
            </div>
            {event ? (
              <EventRenderer event={event} />
            ) : (
              <pre className="overflow-auto rounded-xl border border-border bg-card p-3 font-mono text-xs leading-relaxed">
                {JSON.stringify(row.payload, null, 2)}
              </pre>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export type { TagsEvent };
