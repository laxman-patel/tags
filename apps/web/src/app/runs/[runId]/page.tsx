import { getRunById, listRunEvents } from "@tags/core/runs";
import { listArtifactsForRun } from "@tags/core/artifacts";
import { TaskStatusCard, ToolTraceCard, ArtifactCard } from "@tags/ui";
import { formatToolResultForUser } from "@tags/core/ui-cards";
import type { UICard } from "@tags/core/ui-cards";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { RunTimelineLive } from "./run-timeline-live";

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
      <main className="mx-auto w-full max-w-[900px] px-4 py-10">
        <PageHeader title="Run not found" backHref="/" backLabel="Home" />
      </main>
    );
  }

  const scope = { organizationId: run.organizationId, spaceId: run.spaceId };
  const events = await listRunEvents(db, runId, scope);
  const artifacts = await listArtifactsForRun(db, runId, scope);

  const toolEvents = events
    .filter((e) => e.eventType.startsWith("tool."))
    .map((e) => {
      const payload = e.payload as {
        toolName?: string;
        uiCard?: UICard;
        outputPreview?: unknown;
      };
      const preview = formatToolResultForUser(payload.outputPreview, payload.uiCard);
      return {
        toolName: String(payload.toolName ?? e.eventType),
        status: e.eventType,
        preview,
      };
    });

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-10">
      <PageHeader
        title="Run timeline"
        description="Status, tool calls, and streamed events for this run."
        backHref="/"
        backLabel="Home"
      />

      <div className="grid gap-4">
        <TaskStatusCard
          status={run.status}
          modelId={run.modelId}
          startedAt={run.startedAt?.toISOString()}
          finishedAt={run.finishedAt?.toISOString() ?? undefined}
        />
        <ToolTraceCard events={toolEvents} />
        {artifacts.length > 0 && (
          <div className="grid gap-3">
            {artifacts.map(
              (a: { id: string; title: string; kind: string; url: string; body: string | null }) => (
                <ArtifactCard
                  key={a.id}
                  title={a.title}
                  kind={a.kind}
                  url={a.url}
                  preview={a.body ?? undefined}
                />
              ),
            )}
          </div>
        )}
      </div>

      <h2 className="mt-10 mb-4 text-sm font-medium text-muted-foreground">Events</h2>
      <RunTimelineLive
        runId={runId}
        initialStatus={run.status}
        initialEvents={events.map((e) => ({
          seq: Number(e.seq),
          eventType: e.eventType,
          payload: e.payload,
          createdAt: e.createdAt?.toISOString(),
        }))}
      />
    </main>
  );
}
