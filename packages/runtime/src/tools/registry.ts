import type { Db } from "@tags/db";
import { createCreateArtifactTool } from "./create-artifact";
import { createLinearIssueTool } from "./create-linear-issue";
import { createSearchMemoryTool } from "./search-memory";
import { createSaveMemoryTool } from "./save-memory";
import { createSearchThreadTool } from "./search-thread";
import type { TagsTool } from "./types";

export function resolveTools(
  db: Db,
  enabledTools: string[],
  appUrl = "http://localhost:3000",
): TagsTool[] {
  const registry: Record<string, TagsTool> = {
    search_thread: createSearchThreadTool(db),
    search_memory: createSearchMemoryTool(db),
    save_memory: createSaveMemoryTool(db),
    create_artifact: createCreateArtifactTool(db, appUrl),
    create_linear_issue: createLinearIssueTool,
  };

  return enabledTools
    .map((name) => registry[name])
    .filter((tool): tool is TagsTool => tool !== undefined);
}
