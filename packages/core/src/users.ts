import { and, eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, users } from "@tags/db";

export async function resolveOrCreateUser(
  db: Db,
  args: {
    organizationId: string;
    slackUserId: string;
    displayName?: string;
  },
) {
  const existing = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.organizationId, args.organizationId),
        eq(users.externalProvider, "slack"),
        eq(users.externalUserId, args.slackUserId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    if (!existing[0].displayName && args.displayName) {
      const [updated] = await db
        .update(users)
        .set({ displayName: args.displayName })
        .where(eq(users.id, existing[0].id))
        .returning();
      return updated ?? existing[0];
    }
    return existing[0];
  }

  const id = newId();
  const [row] = await db
    .insert(users)
    .values({
      id,
      organizationId: args.organizationId,
      externalProvider: "slack",
      externalUserId: args.slackUserId,
      displayName: args.displayName,
      role: "member",
    })
    .returning();
  return row!;
}
