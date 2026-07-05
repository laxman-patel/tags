import { desc, eq, max } from "drizzle-orm";
import type { Db } from "@tags/db";
import {
  approvalPolicies,
  budgetPolicies,
  memoryPolicies,
  newId,
  spaceConfigs,
  spaces,
  workspaces,
} from "@tags/db";
import { parseRuntimeMode, parsePassiveLearningMode, loadActiveSpaceConfig, type RuntimeMode, type PassiveLearningMode } from "./spaces";
import { alwaysEnabledNativeTools } from "./tools";

export type CreateSpaceInput = {
  organizationId: string;
  workspaceId: string;
  externalSpaceId: string;
  name: string;
  slug: string;
  modelId: string;
  instructions: string;
  enabledTools?: string[];
  runtimeMode?: RuntimeMode;
  passiveLearningMode?: PassiveLearningMode;
  approvalPolicyId?: string | null;
  budgetPolicyId?: string | null;
  memoryPolicyId?: string | null;
};

export async function listSpaces(db: Db, organizationId: string) {
  return db
    .select({
      space: spaces,
      workspace: workspaces,
    })
    .from(spaces)
    .innerJoin(workspaces, eq(spaces.workspaceId, workspaces.id))
    .where(eq(spaces.organizationId, organizationId))
    .orderBy(desc(spaces.updatedAt));
}

export async function getSpaceById(db: Db, spaceId: string) {
  const rows = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  return rows[0];
}

export async function createSpaceWithConfig(db: Db, input: CreateSpaceInput) {
  const spaceId = newId();
  const configId = newId();
  const [approvalPolicy, budgetPolicy, memoryPolicy] = await Promise.all([
    input.approvalPolicyId
      ? Promise.resolve({ id: input.approvalPolicyId })
      : db
          .select({ id: approvalPolicies.id })
          .from(approvalPolicies)
          .where(eq(approvalPolicies.organizationId, input.organizationId))
          .limit(1)
          .then((rows) => rows[0]),
    input.budgetPolicyId
      ? Promise.resolve({ id: input.budgetPolicyId })
      : db
          .select({ id: budgetPolicies.id })
          .from(budgetPolicies)
          .where(eq(budgetPolicies.organizationId, input.organizationId))
          .limit(1)
          .then((rows) => rows[0]),
    input.memoryPolicyId
      ? Promise.resolve({ id: input.memoryPolicyId })
      : db
          .select({ id: memoryPolicies.id })
          .from(memoryPolicies)
          .where(eq(memoryPolicies.organizationId, input.organizationId))
          .limit(1)
          .then((rows) => rows[0]),
  ]);

  await db.insert(spaces).values({
    id: spaceId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    provider: "slack",
    externalSpaceId: input.externalSpaceId,
    name: input.name,
    slug: input.slug,
    approvalPolicyId: approvalPolicy?.id,
    budgetPolicyId: budgetPolicy?.id,
    memoryPolicyId: memoryPolicy?.id,
  });

  await db.insert(spaceConfigs).values({
    id: configId,
    organizationId: input.organizationId,
    spaceId,
    version: 1,
    modelId: input.modelId,
    instructions: input.instructions,
    enabledTools: alwaysEnabledNativeTools(),
    runtimeMode: input.runtimeMode ?? "opencode",
    passiveLearningMode: input.passiveLearningMode ?? "off",
    isActive: true,
  });

  return { spaceId, configId };
}

export type UpdateSpaceConfigInput = {
  spaceId: string;
  organizationId: string;
  modelId: string;
  reasoning?: string;
  instructions: string;
  enabledSkills?: string[];
  enabledTools: string[];
  enabledConnections?: string[];
  maxSteps?: number;
  runtimeMode?: RuntimeMode;
  repoUrl?: string | null;
  repoUrls?: string[];
  passiveLearningMode?: PassiveLearningMode;
};

export async function createSpaceConfigVersion(db: Db, input: UpdateSpaceConfigInput) {
  const latest = await db
    .select({ version: max(spaceConfigs.version) })
    .from(spaceConfigs)
    .where(eq(spaceConfigs.spaceId, input.spaceId));

  const nextVersion = (Number(latest[0]?.version) || 0) + 1;
  const configId = newId();
  const previous = await loadActiveSpaceConfig(db, input.spaceId);

  await db
    .update(spaceConfigs)
    .set({ isActive: false })
    .where(eq(spaceConfigs.spaceId, input.spaceId));

  let repoUrls: string[];
  if (input.repoUrls !== undefined) {
    repoUrls = input.repoUrls.map((url) => url.trim()).filter(Boolean);
  } else if (input.repoUrl !== undefined) {
    repoUrls = input.repoUrl ? [input.repoUrl.trim()] : [];
  } else {
    repoUrls = previous?.repoUrls ?? (previous?.repoUrl ? [previous.repoUrl] : []);
  }
  const repoUrl = repoUrls[0] ?? null;

  await db.insert(spaceConfigs).values({
    id: configId,
    organizationId: input.organizationId,
    spaceId: input.spaceId,
    version: nextVersion,
    modelId: input.modelId,
    reasoning: input.reasoning ?? previous?.reasoning ?? "provider-default",
    instructions: input.instructions,
    enabledSkills: input.enabledSkills ?? previous?.enabledSkills ?? [],
    enabledTools: alwaysEnabledNativeTools(),
    enabledConnections: input.enabledConnections ?? previous?.enabledConnections ?? [],
    maxSteps: input.maxSteps ?? previous?.maxSteps ?? 12,
    runtimeMode: input.runtimeMode ?? previous?.runtimeMode ?? "opencode",
    passiveLearningMode: parsePassiveLearningMode(
      input.passiveLearningMode ?? previous?.passiveLearningMode ?? "off",
    ),
    repoUrl,
    repoUrls,
    isActive: true,
  });

  await db
    .update(spaces)
    .set({ updatedAt: new Date() })
    .where(eq(spaces.id, input.spaceId));

  return { configId, version: nextVersion };
}

export async function listSpaceConfigVersions(db: Db, spaceId: string) {
  return db
    .select()
    .from(spaceConfigs)
    .where(eq(spaceConfigs.spaceId, spaceId))
    .orderBy(desc(spaceConfigs.version));
}
