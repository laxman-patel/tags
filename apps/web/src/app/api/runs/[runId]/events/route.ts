import { getRunById, listRunEventsAfter } from "@tags/core/runs";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** Poll run events after a sequence number (for live run timeline). */
export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const afterSeq = Number(new URL(request.url).searchParams.get("afterSeq") ?? "0");
  const db = getDb();

  const run = await getRunById(db, runId);
  if (!run) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const events =
    afterSeq > 0
      ? await listRunEventsAfter(db, runId, afterSeq)
      : await listRunEventsAfter(db, runId, 0);

  return Response.json({
    runId,
    status: run.status,
    events: events.map((event) => ({
      seq: Number(event.seq),
      eventType: event.eventType,
      payload: event.payload,
      createdAt: event.createdAt?.toISOString(),
    })),
  });
}
