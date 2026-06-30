import { CronExpressionParser } from "cron-parser";
import { eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, schedules } from "@tags/db";

export type ScheduleRow = typeof schedules.$inferSelect;

/** Cron tick window — the schedule evaluator runs once per minute. */
const CRON_WINDOW_MS = 90_000;

/**
 * Returns true when the schedule's cron expression matches the current minute
 * in its timezone and we have not already fired for that tick.
 */
export function shouldFireSchedule(
  schedule: Pick<ScheduleRow, "cron" | "timezone" | "lastRunAt">,
  now: Date = new Date(),
): boolean {
  try {
    const interval = CronExpressionParser.parse(schedule.cron, {
      currentDate: now,
      tz: schedule.timezone,
    });
    const prevTick = interval.prev().toDate();
    if (now.getTime() - prevTick.getTime() > CRON_WINDOW_MS) {
      return false;
    }
    if (schedule.lastRunAt && schedule.lastRunAt >= prevTick) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function listSchedules(db: Db, spaceId: string) {
  return db.select().from(schedules).where(eq(schedules.spaceId, spaceId));
}

export async function createSchedule(
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    cron: string;
    timezone: string;
    prompt: string;
  },
) {
  const id = newId();
  const [row] = await db
    .insert(schedules)
    .values({
      id,
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      cron: args.cron,
      timezone: args.timezone,
      prompt: args.prompt,
      enabled: true,
    })
    .returning();
  return row;
}

export async function listEnabledSchedules(db: Db) {
  return db.select().from(schedules).where(eq(schedules.enabled, true));
}

export async function markScheduleFired(db: Db, scheduleId: string, firedAt: Date = new Date()) {
  await db
    .update(schedules)
    .set({ lastRunAt: firedAt, updatedAt: firedAt })
    .where(eq(schedules.id, scheduleId));
}
