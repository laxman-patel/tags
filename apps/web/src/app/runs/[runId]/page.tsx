import { getRunById, listRunEvents } from "@tags/core/runs";
import { listArtifactsForRun } from "@tags/core/artifacts";
import { TaskStatusCard, ToolTraceCard, RunTimeline, ArtifactCard } from "@tags/ui";
import Link from "next/link";
import { getDb } from "@/lib/db";

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
  const artifacts = await listArtifactsForRun(db, runId);

  const toolEvents = events
    .filter((e) => e.eventType.startsWith("tool."))
    .map((e) => ({
      toolName: String((e.payload as { toolName?: string }).toolName ?? e.eventType),
      status: e.eventType,
      preview: JSON.stringify(e.payload).slice(0, 200),
    }));

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui" }}>
      <p><Link href="/">← Tags</Link> · <Link href="/admin/approvals">Approvals</Link></p>
      <h1>Run timeline</h1>
      <TaskStatusCard
        status={run.status}
        modelId={run.modelId}
        startedAt={run.startedAt?.toISOString()}
        finishedAt={run.finishedAt?.toISOString() ?? undefined}
      />
      <div style={{ marginTop: 16 }}>
        <ToolTraceCard events={toolEvents} />
      </div>
      {artifacts.length > 0 && (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {artifacts.map((a: { id: string; title: string; kind: string; url: string; body: string | null }) => (
            <ArtifactCard
              key={a.id}
              title={a.title}
              kind={a.kind}
              url={a.url}
              preview={a.body ?? undefined}
            />
          ))}
        </div>
      )}
      <div style={{ marginTop: 24 }}>
        <h2>Events</h2>
        <RunTimeline
          events={events.map((e) => ({
            seq: Number(e.seq),
            eventType: e.eventType,
            payload: e.payload,
            createdAt: e.createdAt?.toISOString(),
          }))}
        />
      </div>
    </main>
  );
}
