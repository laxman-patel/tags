import type { TagsEvent } from "@tags/core/events";
import { formatApprovalSummary } from "@tags/core/approval-display";
import type { UICard } from "@tags/core/ui-cards";
import { ArtifactCard } from "./artifact-card";
import { ApprovalCard } from "./approval-card";

const cardClass = "rounded-xl border border-border bg-card p-3 text-sm text-card-foreground";
const mutedClass = "text-xs text-muted-foreground";
const preClass =
  "mt-2 overflow-auto rounded-lg border border-border/60 bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap";

function UiCardView(props: { card: UICard }) {
  const { card: ui } = props;
  switch (ui.kind) {
    case "artifact":
      return (
        <ArtifactCard
          title={ui.title}
          kind={ui.artifactKind}
          url={ui.url ?? "#"}
          preview={ui.preview}
        />
      );
    case "memory-search":
      return (
        <div className={cardClass}>
          <span className="font-medium">Memory search</span>
          <p className={`mt-1 mb-0 ${mutedClass}`}>Query: {ui.query}</p>
          <ul className="mt-2 mb-0 grid gap-1 pl-5">
            {ui.items.map((item, i) => (
              <li key={i}>
                <code className="text-xs">{item.kind}</code> — {item.content}
              </li>
            ))}
          </ul>
        </div>
      );
    case "memory-saved":
      return (
        <div className={cardClass}>
          <span className="font-medium">Saved to memory</span>
          <p className={`mt-1 mb-0 ${mutedClass}`}>{ui.memoryKind}</p>
          <p className="mt-1 mb-0">{ui.content}</p>
        </div>
      );
    case "thread-search":
      return (
        <div className={cardClass}>
          <span className="font-medium">Thread search</span>
          <p className={`mt-1 mb-0 ${mutedClass}`}>{ui.messageCount} message(s)</p>
          <pre className={preClass}>{ui.preview}</pre>
        </div>
      );
    case "channel-search":
      return (
        <div className={cardClass}>
          <span className="font-medium">Channel search</span>
          <p className={`mt-1 mb-0 ${mutedClass}`}>{ui.messageCount} message(s)</p>
          <pre className={preClass}>{ui.preview}</pre>
        </div>
      );
    case "coding-agent":
      return (
        <div className={cardClass}>
          <span className="font-medium">Coding agent</span>
          <p className={`mt-1 mb-0 ${mutedClass}`}>Exit code: {ui.exitCode}</p>
          <pre className={preClass}>{ui.outputPreview}</pre>
          {ui.gitDiffPreview ? (
            <>
              <p className={`mt-2 mb-0 ${mutedClass}`}>Git diff</p>
              <pre className={preClass}>{ui.gitDiffPreview}</pre>
            </>
          ) : null}
        </div>
      );
    case "schedule-created":
      return (
        <div className={cardClass}>
          <span className="font-medium">Schedule created</span>
          <p className={`mt-1 mb-0 ${mutedClass}`}>Cron: {ui.cron}</p>
          <p className="mt-1 mb-0">{ui.promptPreview}</p>
        </div>
      );
    case "generic":
      return (
        <div className={cardClass}>
          <span className="font-medium">{ui.title}</span>
          <p className="mt-1 mb-0">{ui.body}</p>
        </div>
      );
    default: {
      const _exhaustive: never = ui;
      return _exhaustive;
    }
  }
}

export function EventRenderer(props: { event: TagsEvent }) {
  const { event } = props;

  switch (event.type) {
    case "text.delta":
      return (
        <div className={cardClass}>
          <p className="m-0 leading-relaxed whitespace-pre-wrap">{event.text}</p>
        </div>
      );
    case "status":
      return (
        <div className={`${cardClass} bg-muted/40`}>
          <span className="font-medium">{event.label}</span>
          {event.detail && <p className={`mt-1 mb-0 ${mutedClass}`}>{event.detail}</p>}
        </div>
      );
    case "tool.started":
      return (
        <div className={cardClass}>
          <span className={mutedClass}>Running</span> <code className="text-xs">{event.toolName}</code>
        </div>
      );
    case "tool.progress":
      return (
        <div className={`${cardClass} bg-muted/40`}>
          <span className={mutedClass}>{event.toolName}</span>
          <p className="mt-1 mb-0 text-sm">{event.step}</p>
        </div>
      );
    case "tool.finished":
      return (
        <div className="grid gap-2">
          <div className={cardClass}>
            <span className={mutedClass}>Finished</span>{" "}
            <code className="text-xs">{event.toolName}</code>
          </div>
          {event.uiCard && <UiCardView card={event.uiCard} />}
          {!event.uiCard && event.outputPreview != null && (
            <pre className={`${preClass} mt-0`}>
              {JSON.stringify(event.outputPreview, null, 2).slice(0, 2000)}
            </pre>
          )}
        </div>
      );
    case "approval.requested":
      return (
        <ApprovalCard
          summary={formatApprovalSummary(
            event.toolName ?? "",
            event.inputPreview ?? event.requestText,
          )}
          status="pending"
        />
      );
    case "question.requested":
      return (
        <div className={cardClass}>
          <span className="font-medium">Question requested</span>
          {event.questionText ? <p className="mt-1 mb-0">{event.questionText}</p> : null}
          <p className={`mt-1 mb-0 ${mutedClass}`}>ID: {event.questionId}</p>
        </div>
      );
    case "artifact.created":
      return (
        <ArtifactCard
          title={event.artifactTitle}
          kind="artifact"
          url={event.artifactUrl}
        />
      );
    case "recording.started":
      return (
        <div className={cardClass}>
          <span className="font-medium">Recording demo</span>
          {event.demoKind ? <p className={`mt-1 mb-0 ${mutedClass}`}>{event.demoKind}</p> : null}
          {event.prUrl ? (
            <p className="mt-1 mb-0">
              <a href={event.prUrl} className="underline-offset-4 hover:underline">
                Pull request
              </a>
            </p>
          ) : null}
        </div>
      );
    case "recording.finished":
      return (
        <div className={cardClass}>
          <span className="font-medium">Demo recording ready</span>
          <p className="mt-1 mb-0">
            <a href={event.artifactUrl} className="underline-offset-4 hover:underline">
              Watch video
            </a>
          </p>
          {event.prCommentUrl ? <p className={`mt-1 mb-0 ${mutedClass}`}>PR comment added</p> : null}
        </div>
      );
    case "recording.failed":
      return (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <span className="font-medium text-destructive">Demo recording failed</span>
          <p className="mt-1 mb-0 text-destructive/90">{event.error}</p>
        </div>
      );
    case "run.finished":
      return (
        <div className={cardClass}>
          <span className="font-medium">Run complete</span>
        </div>
      );
    case "run.failed":
      return (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <span className="font-medium text-destructive">Run failed</span>
          <p className="mt-1 mb-0 text-destructive/90">{event.error}</p>
        </div>
      );
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

export { UiCardView };
