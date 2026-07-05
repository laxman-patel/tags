import { and, eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, organizations, users } from "@tags/db";
import { createDefaultPolicies } from "./policies";

export type ClerkAccountUser = {
  id: string;
  fullName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
};

export type TagsAccount = {
  organization: typeof organizations.$inferSelect;
  user: typeof users.$inferSelect;
};

function clerkDisplayName(clerkUser: ClerkAccountUser): string {
  return (
    clerkUser.fullName ||
    clerkUser.username ||
    clerkUser.primaryEmailAddress?.emailAddress ||
    "Tags user"
  );
}

async function findClerkAccount(db: Db, clerkUserId: string): Promise<TagsAccount | null> {
  const rows = await db
    .select({ user: users, organization: organizations })
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .where(and(eq(users.externalProvider, "clerk"), eq(users.externalUserId, clerkUserId)))
    .limit(1);

  return rows[0] ?? null;
}

export async function getAccountForClerkUser(
  db: Db,
  clerkUserId: string,
): Promise<TagsAccount | null> {
  return findClerkAccount(db, clerkUserId);
}

export async function resolveOrCreateClerkAccount(
  db: Db,
  clerkUser: ClerkAccountUser,
): Promise<TagsAccount> {
  const existing = await findClerkAccount(db, clerkUser.id);
  if (existing) return existing;

  const organizationId = newId();
  const userId = newId();
  const displayName = clerkDisplayName(clerkUser);

  await db.insert(organizations).values({
    id: organizationId,
    name: `${displayName}'s Tags`,
  });

  const policies = await createDefaultPolicies(db, organizationId);
  await db
    .update(organizations)
    .set({ budgetPolicyId: policies.budgetId })
    .where(eq(organizations.id, organizationId));

  await db.insert(users).values({
    id: userId,
    organizationId,
    externalProvider: "clerk",
    externalUserId: clerkUser.id,
    displayName,
    role: "owner",
  });

  const created = await findClerkAccount(db, clerkUser.id);
  if (!created) throw new Error("Failed to create Clerk account");
  return created;
}
