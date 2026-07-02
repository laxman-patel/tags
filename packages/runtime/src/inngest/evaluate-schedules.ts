import { listEnabledSchedules, markScheduleFired, shouldFireSchedule } from "@tags/core/schedules";
import { getSpaceById } from "@tags/core/spaces-admin";
import { createDb, workspaces } from "@tags/db";
import { eq } from "drizzle-orm";
import { inngest, RUN_REQUESTED_EVENT } from "./client";
import type { TagsRunInput } from "./functions";
import { loadRuntimeSecrets } from "../secrets";

export type ScheduleTickResult = {
  fired: string[];
  skipped: number;
};

/**
 * Loads enabled Space schedules from Postgres and enqueues `tags/run.requested`
 * for each row whose cron expression matches the current minute.
 */
export async function evaluateAndFireSchedules(): Promise<ScheduleTickResult> {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);
  const appUrl = secrets.appUrl;
  const now = new Date();
  const allSchedules = await listEnabledSchedules(db);
  const fired: string[] = [];
  let skipped = 0;

  for (const schedule of allSchedules) {
    if (!shouldFireSchedule(schedule, now)) {
      skipped += 1;
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

    const data: TagsRunInput = {
      organizationId: space.organizationId,
      workspaceId: space.workspaceId,
      spaceId: space.id,
      spaceName: space.name,
      channelId: space.externalSpaceId,
      teamId,
      threadTs: "",
      rootMessageTs: "",
      triggerText: schedule.prompt,
      triggerMessageTs: "",
      actorSlackUserId: "schedule",
      idempotencyKey: `schedule:${schedule.id}:${now.toISOString()}`,
      appUrl,
      trigger: "schedule",
      isScheduled: true,
    };

    await inngest.send({ name: RUN_REQUESTED_EVENT, data });
    await markScheduleFired(db, schedule.id, now);
    fired.push(schedule.id);
  }

  return { fired, skipped };
}
