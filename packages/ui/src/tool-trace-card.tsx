import type { CSSProperties } from "react";

export function ToolTraceCard(props: {
  events: Array<{ toolName: string; status?: string; preview?: string }>;
}) {
  return (
    <div style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: 16 }}>
      <strong>Tool trace</strong>
      <ul style={{ marginTop: 8 }}>
        {props.events.map((e, i) => (
          <li key={i} style={{ marginBottom: 8 }}>
            <code>{e.toolName}</code> {e.status && `— ${e.status}`}
            {e.preview && <pre style={{ fontSize: 12, marginTop: 4 }}>{e.preview}</pre>}
          </li>
        ))}
      </ul>
    </div>
  );
}
