import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        padding: 48,
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "system-ui",
      }}
    >
      <h1>Tags</h1>
      <p style={{ color: "#555", lineHeight: 1.6 }}>
        Channel-native agent for Slack. Mention <strong>@tags</strong> in your mapped
        channel to start a run. Open run detail pages from Slack links or{" "}
        <code>/runs/&lt;run-id&gt;</code>.
      </p>
      <h2>Phase 0</h2>
      <ul>
        <li>Slack mention → durable workflow → AI Gateway model</li>
        <li>Throttled Slack streaming via message edits</li>
        <li>Approval-gated <code>create_linear_issue</code> tool</li>
        <li>Read-only <code>search_thread</code> tool</li>
      </ul>
      <p>
        <Link href="/api/slack/events">Slack events endpoint</Link>
      </p>
    </main>
  );
}
