import { and, eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { spaceConfigs, spaces, workspaces } from "@tags/db";
import { alwaysEnabledNativeTools, isNativeToolId } from "./tools";

export const RUNTIME_MODES = ["opencode", "orchestrator"] as const;
export type RuntimeMode = (typeof RUNTIME_MODES)[number];

export const PASSIVE_LEARNING_MODES = ["off", "ingest_only", "extract_memory"] as const;
export type PassiveLearningMode = (typeof PASSIVE_LEARNING_MODES)[number];

export function parsePassiveLearningMode(value: string | null | undefined): PassiveLearningMode {
  if (value === "ingest_only" || value === "extract_memory") return value;
  return "off";
}

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
  availableConnections: string[];
  enabledConnections: string[];
  maxSteps: number;
  /**
   * @deprecated opencode is the only supported runtime. The orchestrator path
   * is legacy and not wired into the Slack workflow. Kept for DB backwards compat.
   */
  runtimeMode: RuntimeMode;
  repoUrl?: string | null;
  repoUrls?: string[];
  passiveLearningMode: PassiveLearningMode;
};

/**
 * @deprecated Always returns "opencode". The orchestrator runtime is legacy
 * and no longer wired into the Slack workflow.
 */
export function parseRuntimeMode(_value: string | null | undefined): RuntimeMode {
  return "opencode";
}

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

  const legacyConnections = row.enabledTools.filter((toolId) => !isNativeToolId(toolId));
  const enabledConnections = Array.from(new Set([...(row.enabledConnections ?? []), ...legacyConnections]));

  return {
    id: row.id,
    organizationId: row.organizationId,
    spaceId: row.spaceId,
    version: row.version,
    modelId: row.modelId,
    reasoning: row.reasoning,
    instructions: row.instructions,
    enabledSkills: row.enabledSkills,
    enabledTools: alwaysEnabledNativeTools(),
    availableConnections: Array.from(new Set([...(row.availableConnections ?? []), ...enabledConnections])),
    enabledConnections,
    maxSteps: row.maxSteps,
    runtimeMode: parseRuntimeMode(row.runtimeMode),
    repoUrl: row.repoUrl,
    repoUrls:
      (row.repoUrls ?? []).length > 0
        ? row.repoUrls ?? []
        : row.repoUrl
          ? [row.repoUrl]
          : [],
    passiveLearningMode: parsePassiveLearningMode(row.passiveLearningMode),
  };
}
