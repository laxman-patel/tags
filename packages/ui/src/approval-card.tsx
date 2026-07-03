export function ApprovalCard(props: {
  toolName: string;
  requestText: string;
  riskLevel: string;
  status: string;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm text-card-foreground">
      <div className="flex items-center gap-2">
        <span className="font-medium">Approval</span>
        <code className="text-xs">{props.toolName}</code>
      </div>
      <p className="mt-2 mb-0 leading-relaxed text-muted-foreground">{props.requestText}</p>
      <p className="mt-2 mb-0 text-xs text-muted-foreground">
        Risk: {props.riskLevel} · Status: {props.status}
      </p>
      {props.status === "pending" && props.onApprove && props.onReject && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={props.onApprove}
            className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={props.onReject}
            className="inline-flex h-8 items-center rounded-lg bg-destructive/10 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
