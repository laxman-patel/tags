export function ApprovalCard(props: {
  summary: string;
  status: string;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const resolved = props.status !== "pending";

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm text-card-foreground">
      <p className="m-0 font-medium leading-relaxed">{props.summary}</p>
      {resolved ? (
        <p className="mt-2 mb-0 text-xs text-muted-foreground">
          {props.status === "approved" ? "Approved" : "Declined"}
        </p>
      ) : props.onApprove && props.onReject ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={props.onApprove}
            className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-transform duration-150 ease-out active:scale-[0.97] hover:bg-primary/80"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={props.onReject}
            className="inline-flex h-8 items-center rounded-lg bg-destructive/10 px-3 text-sm font-medium text-destructive transition-transform duration-150 ease-out active:scale-[0.97] hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30"
          >
            Decline
          </button>
        </div>
      ) : (
        <p className="mt-2 mb-0 text-xs text-muted-foreground">Waiting for approval</p>
      )}
    </div>
  );
}
