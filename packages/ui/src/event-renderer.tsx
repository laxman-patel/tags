import type { CSSProperties } from "react";
import type { TagsEvent } from "@tags/core/events";
import type { UICard } from "@tags/core/ui-cards";
import { ArtifactCard } from "./artifact-card";
import { ApprovalCard } from "./approval-card";

const card: CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: 12,
  marginBottom: 8,
  background: "#fff",
};

const muted: CSSProperties = { fontSize: 13, color: "#71717a" };

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
        <div style={card}>
          <strong>Memory search</strong>
          <p style={muted}>Query: {ui.query}</p>
          <ul style={{ marginTop: 8, paddingLeft: 20 }}>
            {ui.items.map((item, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <code>{item.kind}</code> — {item.content}
              </li>
            ))}
          </ul>
        </div>
      );
    case "memory-saved":
      return (
        <div style={card}>
          <strong>Saved to memory</strong>
          <p style={muted}>{ui.memoryKind}</p>
          <p>{ui.content}</p>
        </div>
      );
    case "thread-search":
      return (
        <div style={card}>
          <strong>Thread search</strong>
          <p style={muted}>{ui.messageCount} message(s)</p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{ui.preview}</pre>
        </div>
      );
    case "coding-agent":
      return (
        <div style={card}>
          <strong>Coding agent</strong>
          <p style={muted}>Exit code: {ui.exitCode}</p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{ui.outputPreview}</pre>
          {ui.gitDiffPreview ? (
            <>
              <p style={muted}>Git diff</p>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{ui.gitDiffPreview}</pre>
            </>
          ) : null}
        </div>
      );
    case "schedule-created":
      return (
        <div style={card}>
          <strong>Schedule created</strong>
          <p style={muted}>Cron: {ui.cron}</p>
          <p>{ui.promptPreview}</p>
        </div>
      );
    case "generic":
      return (
        <div style={card}>
          <strong>{ui.title}</strong>
          <p>{ui.body}</p>
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
        <div style={card}>
          <p style={{ whiteSpace: "pre-wrap" }}>{event.text}</p>
        </div>
      );
    case "status":
      return (
        <div style={{ ...card, background: "#f4f4f5" }}>
          <strong>{event.label}</strong>
          {event.detail && <p style={muted}>{event.detail}</p>}
        </div>
      );
    case "tool.started":
      return (
        <div style={card}>
          <span style={muted}>🔧 Running</span> <code>{event.toolName}</code>
        </div>
      );
    case "tool.finished":
      return (
        <div>
          <div style={card}>
            <span style={muted}>✓ Finished</span> <code>{event.toolName}</code>
          </div>
          {event.uiCard && <UiCardView card={event.uiCard} />}
          {!event.uiCard && event.outputPreview != null && (
            <pre style={{ ...card, fontSize: 12, overflow: "auto" }}>
              {JSON.stringify(event.outputPreview, null, 2).slice(0, 2000)}
            </pre>
          )}
        </div>
      );
    case "approval.requested":
      return (
        <ApprovalCard
          toolName="Pending approval"
          requestText={`Approval ${event.approvalId}`}
          riskLevel="unknown"
          status="pending"
        />
      );
    case "question.requested":
      return (
        <div style={card}>
          <strong>Question requested</strong>
          {event.questionText ? <p>{event.questionText}</p> : null}
          <p style={muted}>ID: {event.questionId}</p>
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
    case "run.finished":
      return (
        <div style={{ ...card, background: "#ecfdf5" }}>
          <strong>Run complete</strong>
        </div>
      );
    case "run.failed":
      return (
        <div style={{ ...card, borderColor: "#fca5a5", background: "#fef2f2" }}>
          <strong>Run failed</strong>
          <p>{event.error}</p>
        </div>
      );
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

export { UiCardView };
