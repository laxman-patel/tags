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
      <h2>Admin</h2>
      <p style={{ color: "#555", lineHeight: 1.6 }}>
        Sign in with Clerk to manage spaces, approvals, usage, and audit logs.
      </p>
      <p>
        <Link href="/admin/spaces">Spaces</Link> ·
        <Link href="/admin/approvals">Approvals</Link> ·
        <Link href="/admin/audit">Audit</Link>
      </p>
    </main>
  );
}
