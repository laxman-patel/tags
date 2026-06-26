export function RunTimeline(props: {
  events: Array<{ seq: number; eventType: string; payload: unknown; createdAt?: string }>;
}) {
  return (
    <ol style={{ lineHeight: 1.6 }}>
      {props.events.map((event) => (
        <li key={event.seq} style={{ marginBottom: 12 }}>
          <code>{event.eventType}</code>
          <pre
            style={{
              background: "#f4f4f5",
              padding: 12,
              borderRadius: 8,
              overflow: "auto",
              fontSize: 13,
            }}
          >
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </li>
      ))}
    </ol>
  );
}
