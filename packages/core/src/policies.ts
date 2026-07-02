import { and, eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { approvalPolicies, budgetPolicies, memoryPolicies, newId, organizations, spaces } from "@tags/db";
import { getMonthlySpendMicroUsd, getOrgMonthlySpendMicroUsd } from "./usage";

export async function getApprovalPolicyForSpace(db: Db, spaceId: string) {
  const { spaces } = await import("@tags/db");
  const space = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  const policyId = space[0]?.approvalPolicyId;
  if (!policyId) return null;
  const rows = await db
    .select()
    .from(approvalPolicies)
    .where(eq(approvalPolicies.id, policyId))
    .limit(1);
  return rows[0];
}

export async function canApprove(
  db: Db,
  args: {
    spaceId: string;
    organizationId: string;
    slackUserId: string;
    requesterSlackUserId?: string;
  },
): Promise<boolean> {
  const policy = await getApprovalPolicyForSpace(db, args.spaceId);
  if (!policy) return true;

  if (
    args.requesterSlackUserId &&
    args.requesterSlackUserId === args.slackUserId &&
    !policy.allowSelfApprove
  ) {
    return false;
  }

  if (policy.approverAllowlist.length > 0) {
    return policy.approverAllowlist.includes(args.slackUserId);
  }

  if (policy.requireAdminRole) {
    const { users } = await import("@tags/db");
    const userRows = await db
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
    const user = userRows[0];
    return user?.role === "admin" || user?.role === "owner";
  }

  return true;
}

export async function createDefaultPolicies(db: Db, organizationId: string) {
  const approvalId = newId();
  const budgetId = newId();
  const memoryId = newId();

  await db.insert(approvalPolicies).values({
    id: approvalId,
    organizationId,
    name: "Default approval policy",
    requireAdminRole: false,
    approverAllowlist: [],
    allowSelfApprove: false,
    defaultExpiryMinutes: 60,
  });

  await db.insert(budgetPolicies).values({
    id: budgetId,
    organizationId,
    name: "Default budget",
    monthlyBudgetMicroUsd: 50_000_000,
    hardLimit: false,
  });

  await db.insert(memoryPolicies).values({
    id: memoryId,
    organizationId,
    name: "Default memory policy",
    allowAgentProposed: true,
    requireApprovalForSensitive: true,
  });

  return { approvalId, budgetId, memoryId };
}

export async function getMemoryPolicyForSpace(db: Db, spaceId: string) {
  const space = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  const policyId = space[0]?.memoryPolicyId;
  if (!policyId) return null;
  const rows = await db
    .select()
    .from(memoryPolicies)
    .where(eq(memoryPolicies.id, policyId))
    .limit(1);
  return rows[0];
}

export async function getBudgetPolicy(db: Db, organizationId: string, policyId?: string | null) {
  if (!policyId) return null;
  const rows = await db
    .select()
    .from(budgetPolicies)
    .where(and(eq(budgetPolicies.id, policyId), eq(budgetPolicies.organizationId, organizationId)))
    .limit(1);
  return rows[0];
}

export type SpaceBudgetStatus = {
  allowed: boolean;
  exceeded: boolean;
  hardLimit: boolean;
  spentMicroUsd: number;
  budgetMicroUsd: number;
  orgExceeded?: boolean;
  orgSpentMicroUsd?: number;
  orgBudgetMicroUsd?: number;
};

export async function checkSpaceBudget(db: Db, spaceId: string): Promise<SpaceBudgetStatus> {
  const spaceRows = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  const space = spaceRows[0];
  if (!space) {
    return {
      allowed: true,
      exceeded: false,
      hardLimit: false,
      spentMicroUsd: 0,
      budgetMicroUsd: 0,
    };
  }

  const policy = await getBudgetPolicy(db, space.organizationId, space.budgetPolicyId);
  const spentMicroUsd = await getMonthlySpendMicroUsd(db, spaceId);
  const spaceExceeded = policy ? spentMicroUsd >= policy.monthlyBudgetMicroUsd : false;
  const spaceBlocked = spaceExceeded && (policy?.hardLimit ?? false);

  const orgRows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, space.organizationId))
    .limit(1);
  const org = orgRows[0];
  let orgExceeded = false;
  let orgBlocked = false;
  let orgSpentMicroUsd = 0;
  let orgBudgetMicroUsd = 0;

  if (org?.budgetPolicyId) {
    const orgPolicy = await getBudgetPolicy(db, space.organizationId, org.budgetPolicyId);
    if (orgPolicy) {
      orgSpentMicroUsd = await getOrgMonthlySpendMicroUsd(db, space.organizationId);
      orgBudgetMicroUsd = orgPolicy.monthlyBudgetMicroUsd;
      orgExceeded = orgSpentMicroUsd >= orgPolicy.monthlyBudgetMicroUsd;
      orgBlocked = orgExceeded && orgPolicy.hardLimit;
    }
  }

  const exceeded = spaceExceeded || orgExceeded;
  const allowed = !spaceBlocked && !orgBlocked;

  return {
    allowed,
    exceeded,
    hardLimit: (policy?.hardLimit ?? false) || orgBlocked,
    spentMicroUsd,
    budgetMicroUsd: policy?.monthlyBudgetMicroUsd ?? 0,
    orgExceeded,
    orgSpentMicroUsd,
    orgBudgetMicroUsd,
  };
}
