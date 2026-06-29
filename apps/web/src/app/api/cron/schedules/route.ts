import { listEnabledSchedules, markScheduleFired, shouldFireSchedule } from "@tags/core/schedules";
import { getSpaceById } from "@tags/core/spaces-admin";
import { workspaces } from "@tags/db";
import { eq } from "drizzle-orm";
import { getEnv } from "@/env";
import { startRunFromSlack } from "@/lib/slack-run";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** Cron route: evaluate enabled schedules and fire only when cron matches. */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const env = getEnv();
  const db = getDb();
  const now = new Date();
  const allSchedules = await listEnabledSchedules(db);
  const fired: string[] = [];
  const skipped: string[] = [];

  for (const schedule of allSchedules) {
    if (!shouldFireSchedule(schedule, now)) {
      skipped.push(schedule.id);
      continue;
    }

    const space = await getSpaceById(db, schedule.spaceId);
    if (!space) continue;

    const ws = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, space.workspaceId))
      .limit(1);
    const teamId = ws[0]?.externalWorkspaceId ?? "";

    const scheduleThreadTs = `${Date.now()}.000000`;
    await startRunFromSlack(env, {
      teamId,
      channelId: space.externalSpaceId,
      threadTs: scheduleThreadTs,
      rootTs: scheduleThreadTs,
      text: schedule.prompt,
      messageTs: scheduleThreadTs,
      actorSlackUserId: "schedule",
      eventId: `schedule:${schedule.id}:${now.toISOString()}`,
      trigger: "schedule",
    });
    await markScheduleFired(db, schedule.id, now);
    fired.push(schedule.id);
  }

  return Response.json({ fired, skipped: skipped.length });
}
