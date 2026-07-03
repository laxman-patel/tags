export function TaskStatusCard(props: {
  status: string;
  modelId: string;
  startedAt?: string;
  finishedAt?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm text-card-foreground">
      <div className="flex items-center gap-2">
        <span className="font-medium">Run status</span>
        <span className="inline-flex h-5 items-center rounded-full border border-border px-2 text-xs font-medium">
          {props.status}
        </span>
      </div>
      <dl className="mt-3 grid gap-1.5 text-muted-foreground">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-xs leading-5">Model</dt>
          <dd className="m-0 font-mono text-xs leading-5 text-foreground">{props.modelId}</dd>
        </div>
        {props.startedAt && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-xs leading-5">Started</dt>
            <dd className="m-0 text-xs leading-5">{props.startedAt}</dd>
          </div>
        )}
        {props.finishedAt && (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-xs leading-5">Finished</dt>
            <dd className="m-0 text-xs leading-5">{props.finishedAt}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
