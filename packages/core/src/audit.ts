import { desc, eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { auditEvents } from "@tags/db";

export async function recordAuditEvent(
  db: Db,
  args: {
    organizationId: string;
    spaceId?: string;
    actorUserId?: string;
    actorType: "human" | "agent" | "system";
    eventType: string;
    payload?: Record<string, unknown>;
  },
) {
  await db.insert(auditEvents).values({
    organizationId: args.organizationId,
    spaceId: args.spaceId,
    actorUserId: args.actorUserId,
    actorType: args.actorType,
    eventType: args.eventType,
    payload: args.payload ?? {},
  });
}

export async function listAuditEvents(db: Db, organizationId: string, limit = 100) {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.organizationId, organizationId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}
