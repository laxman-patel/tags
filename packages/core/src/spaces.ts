import { and, eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { spaceConfigs, spaces, workspaces } from "@tags/db";

export type ActiveSpaceConfig = {
  id: string;
  organizationId: string;
  spaceId: string;
  version: number;
  modelId: string;
  reasoning: string;
  instructions: string;
  enabledSkills: string[];
  enabledTools: string[];
  enabledConnections: string[];
  maxSteps: number;
};

export async function resolveSpaceByChannel(
  db: Db,
  teamId: string,
  channelId: string,
): Promise<{
  space: typeof spaces.$inferSelect;
  workspace: typeof workspaces.$inferSelect;
} | null> {
  const rows = await db
    .select({
      space: spaces,
      workspace: workspaces,
    })
    .from(spaces)
    .innerJoin(workspaces, eq(spaces.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaces.externalWorkspaceId, teamId),
        eq(spaces.externalSpaceId, channelId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function loadActiveSpaceConfig(
  db: Db,
  spaceId: string,
): Promise<ActiveSpaceConfig | null> {
  const rows = await db
    .select()
    .from(spaceConfigs)
    .where(and(eq(spaceConfigs.spaceId, spaceId), eq(spaceConfigs.isActive, true)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    organizationId: row.organizationId,
    spaceId: row.spaceId,
    version: row.version,
    modelId: row.modelId,
    reasoning: row.reasoning,
    instructions: row.instructions,
    enabledSkills: row.enabledSkills,
    enabledTools: row.enabledTools,
    enabledConnections: row.enabledConnections,
    maxSteps: row.maxSteps,
  };
}
