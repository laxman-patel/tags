import type { TagsEvent } from "@tags/core/events";
import { EventRenderer } from "./event-renderer";
import { parseTagsEvent } from "./parse-event";

export function RunTimeline(props: {
  events: Array<{ seq: number; eventType: string; payload: unknown; createdAt?: string }>;
}) {
  return (
    <ol style={{ lineHeight: 1.6, listStyle: "none", padding: 0 }}>
      {props.events.map((row) => {
        const event = parseTagsEvent(row.eventType, row.payload);
        return (
          <li key={row.seq} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#71717a", marginBottom: 4 }}>
              #{row.seq} · {row.eventType}
              {row.createdAt && ` · ${row.createdAt}`}
            </div>
            {event ? (
              <EventRenderer event={event} />
            ) : (
              <pre
                style={{
                  background: "#f4f4f5",
                  padding: 12,
                  borderRadius: 8,
                  overflow: "auto",
                  fontSize: 13,
                }}
              >
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
