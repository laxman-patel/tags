import type { Db } from "@tags/db";
import type { RuntimeProviderConfig, RuntimeProviders } from "../providers";
import { createCreateArtifactTool } from "./create-artifact";
import { createRunCodingAgentTool } from "./run-coding-agent";
import { createSearchChannelTool } from "./search-channel";
import { createSearchMemoryTool } from "./search-memory";
import { createSaveMemoryTool } from "./save-memory";
import { createSearchThreadTool } from "./search-thread";
import { createAskUserTool } from "./ask-user";
import { createCreateScheduleTool } from "./create-schedule";
import { createSlackClient } from "@tags/slack";
import type { TagsTool } from "./types";

export type ToolRegistryOptions = RuntimeProviders & {
  appUrl?: string;
  providerConfig?: RuntimeProviderConfig;
};

export function resolveTools(
  db: Db,
  enabledTools: string[],
  options: ToolRegistryOptions,
): TagsTool[] {
  const appUrl = options.appUrl ?? "http://localhost:3000";

  const registry: Record<string, TagsTool> = {
    search_thread: createSearchThreadTool(db),
    search_channel: createSearchChannelTool(createSlackClient, options.providerConfig?.slackBotToken),
    search_memory: createSearchMemoryTool(db),
    save_memory: createSaveMemoryTool(db),
    create_artifact: createCreateArtifactTool(db, appUrl),
    run_coding_agent: createRunCodingAgentTool(db, options.providerConfig),
    ask_user: createAskUserTool(db),
    create_schedule: createCreateScheduleTool(db),
  };

  return enabledTools
    .map((name) => registry[name])
    .filter((tool): tool is TagsTool => tool !== undefined);
}
