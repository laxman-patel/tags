import { eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, schedules } from "@tags/db";

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
