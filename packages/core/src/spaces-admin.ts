import { desc, eq, max } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, spaceConfigs, spaces, workspaces } from "@tags/db";
import { parseRuntimeMode, loadActiveSpaceConfig, type RuntimeMode } from "./spaces";

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

  await db.insert(spaces).values({
    id: spaceId,
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    provider: "slack",
    externalSpaceId: input.externalSpaceId,
    name: input.name,
    slug: input.slug,
  });

  await db.insert(spaceConfigs).values({
    id: configId,
    organizationId: input.organizationId,
    spaceId,
    version: 1,
    modelId: input.modelId,
    instructions: input.instructions,
    enabledTools: input.enabledTools ?? ["search_thread", "create_artifact"],
    runtimeMode: input.runtimeMode ?? "opencode",
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
  enabledTools: string[];
  maxSteps?: number;
  runtimeMode?: RuntimeMode;
  repoUrl?: string | null;
};

export async function createSpaceConfigVersion(db: Db, input: UpdateSpaceConfigInput) {
  const latest = await db
    .select({ version: max(spaceConfigs.version) })
    .from(spaceConfigs)
    .where(eq(spaceConfigs.spaceId, input.spaceId));

  const nextVersion = (Number(latest[0]?.version) || 0) + 1;
  const configId = newId();

  await db
    .update(spaceConfigs)
    .set({ isActive: false })
    .where(eq(spaceConfigs.spaceId, input.spaceId));

  const active = await loadActiveSpaceConfig(db, input.spaceId);

  await db.insert(spaceConfigs).values({
    id: configId,
    organizationId: input.organizationId,
    spaceId: input.spaceId,
    version: nextVersion,
    modelId: input.modelId,
    reasoning: input.reasoning ?? active?.reasoning ?? "provider-default",
    instructions: input.instructions,
    enabledSkills: active?.enabledSkills ?? [],
    enabledTools: input.enabledTools,
    enabledConnections: active?.enabledConnections ?? [],
    maxSteps: input.maxSteps ?? active?.maxSteps ?? 12,
    runtimeMode: input.runtimeMode ?? active?.runtimeMode ?? "opencode",
    repoUrl: input.repoUrl !== undefined ? input.repoUrl : (active?.repoUrl ?? null),
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
