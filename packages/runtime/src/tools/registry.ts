import type { CredentialProvider } from "@tags/connections";
import type { SandboxProvider } from "@tags/sandbox";
import type { S3Client } from "@aws-sdk/client-s3";
import type { R2Config } from "@tags/storage";
import type { Db } from "@tags/db";
import { createCreateArtifactTool } from "./create-artifact";
import { createCreateLinearIssueTool } from "./create-linear-issue";
import { createRunSandboxCommandTool } from "./run-sandbox-command";
import { createSearchMemoryTool } from "./search-memory";
import { createSaveMemoryTool } from "./save-memory";
import { createSearchThreadTool } from "./search-thread";
import type { TagsTool } from "./types";

export type ToolRegistryOptions = {
  appUrl?: string;
  credentials: CredentialProvider;
  sandbox: SandboxProvider;
  r2?: {
    client: S3Client;
    config: R2Config;
  };
};

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
