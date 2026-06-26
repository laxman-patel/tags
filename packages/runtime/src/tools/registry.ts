import type { Db } from "@tags/db";
import { createLinearIssueTool } from "./create-linear-issue";
import { createSearchThreadTool } from "./search-thread";
import type { TagsTool } from "./types";

export function resolveTools(db: Db, enabledTools: string[]): TagsTool[] {
  const registry: Record<string, TagsTool> = {
    search_thread: createSearchThreadTool(db),
    create_linear_issue: createLinearIssueTool,
  };

  return enabledTools
    .map((name) => registry[name])
    .filter((tool): tool is TagsTool => tool !== undefined);
}
