import { listRunEvents, getRunById } from "@tags/core/runs";
import { getEnv } from "@/env";
import { getDb } from "@/lib/db";
import Link from "next/link";

export const runtime = "nodejs";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const db = getDb();
  const run = await getRunById(db, runId);

  if (!run) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Run not found</h1>
      </main>
    );
  }

  const events = await listRunEvents(db, runId);
  const env = getEnv();

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui" }}>
      <p>
        <Link href="/">← Tags</Link>
      </p>
      <h1>Run timeline</h1>
      <p style={{ color: "#666" }}>
        Status: <strong>{run.status}</strong> · Model: {run.modelId}
      </p>
      <ol style={{ lineHeight: 1.6 }}>
        {events.map((event) => (
          <li key={event.id} style={{ marginBottom: 12 }}>
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
      <p style={{ fontSize: 13, color: "#888" }}>
        {env.NEXT_PUBLIC_APP_URL}/runs/{runId}
      </p>
    </main>
  );
}
