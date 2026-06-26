import { listEnabledSchedules } from "@tags/core/schedules";
import { getSpaceById } from "@tags/core/spaces-admin";
import { workspaces } from "@tags/db";
import { eq } from "drizzle-orm";
import { getEnv } from "@/env";
import { startRunFromSlack } from "@/lib/slack-run";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

/** Vercel Cron: fire enabled schedules (daily digest primitive). */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const env = getEnv();
  const db = getDb();
  const schedules = await listEnabledSchedules(db);
  const fired: string[] = [];

  for (const schedule of schedules) {
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
      eventId: `schedule:${schedule.id}:${Date.now()}`,
      trigger: "mention",
    });
    fired.push(schedule.id);
  }

  return Response.json({ fired });
}
