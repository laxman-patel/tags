export function ToolTraceCard(props: {
  events: Array<{ toolName: string; status?: string; preview?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm text-card-foreground">
      <span className="font-medium">Tool trace</span>
      {props.events.length === 0 && (
        <p className="mt-2 mb-0 text-xs text-muted-foreground">No tool calls recorded.</p>
      )}
      <ul className="mt-3 grid list-none gap-3 p-0">
        {props.events.map((e, i) => (
          <li key={i}>
            <div className="flex items-center gap-2">
              <code className="text-xs">{e.toolName}</code>
              {e.status && <span className="text-xs text-muted-foreground">{e.status}</span>}
            </div>
            {e.preview && (
              <pre className="mt-1.5 overflow-auto rounded-lg border border-border/60 bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {e.preview}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
