import type { Db } from "@tags/db";
import type { RuntimeProviders } from "../providers";
import { createCreateArtifactTool } from "./create-artifact";
import { createCreateLinearIssueTool } from "./create-linear-issue";
import { createRunSandboxCommandTool } from "./run-sandbox-command";
import { createSearchMemoryTool } from "./search-memory";
import { createSaveMemoryTool } from "./save-memory";
import { createSearchThreadTool } from "./search-thread";
import type { TagsTool } from "./types";

export type ToolRegistryOptions = RuntimeProviders & { appUrl?: string };

export function resolveTools(
  db: Db,
  enabledTools: string[],
  options: ToolRegistryOptions,
): TagsTool[] {
  const appUrl = options.appUrl ?? "http://localhost:3000";

  const registry: Record<string, TagsTool> = {
    search_thread: createSearchThreadTool(db),
    search_memory: createSearchMemoryTool(db),
    save_memory: createSaveMemoryTool(db),
    create_artifact: createCreateArtifactTool(db, appUrl),
    create_linear_issue: createCreateLinearIssueTool(),
    run_sandbox_command: createRunSandboxCommandTool(),
  };

  return enabledTools
    .map((name) => registry[name])
    .filter((tool): tool is TagsTool => tool !== undefined);
}
