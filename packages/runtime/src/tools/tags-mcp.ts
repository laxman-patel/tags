import { appendRunEvent } from "@tags/core/runs";
import type { TagsEvent } from "@tags/core/events";
import type { Db } from "@tags/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { ComposioMcpServerConfig } from "./composio";
import { resolveTools } from "./registry";
import type { TagsTool, ToolContext } from "./types";
import {
  createTagsMcpRunToken,
  type TagsMcpRunClaims,
  verifyTagsMcpRunToken,
} from "./tags-mcp-token";
import type { RuntimeProviderConfig, RuntimeProviders } from "../providers";

/** Native tools that cannot run inside the opencode sandbox MCP bridge. */
export const OPENCODE_MCP_EXCLUDED_TOOLS = new Set([
  "run_coding_agent",
  "ask_user",
  "create_schedule",
]);

export type TagsMcpServerConfig = ComposioMcpServerConfig;

export type TagsMcpRunContext = Omit<TagsMcpRunClaims, "exp">;

export function createTagsMcpServerConfig(args: {
  appUrl: string;
  token: string;
}): TagsMcpServerConfig {
  return {
    type: "remote",
    url: `${args.appUrl.replace(/\/$/, "")}/api/mcp/tags`,
    enabled: true,
    headers: {
      Authorization: `Bearer ${args.token}`,
    },
    timeout: 30_000,
  };
}

export function buildTagsMcpRunToken(
  context: TagsMcpRunContext,
  signingSecret: string,
): string | null {
  if (!signingSecret) return null;
  const enabledTools = context.enabledTools.filter(
    (tool) => !OPENCODE_MCP_EXCLUDED_TOOLS.has(tool),
  );
  if (enabledTools.length === 0) return null;

  return createTagsMcpRunToken(
    {
      ...context,
      enabledTools,
    },
    signingSecret,
  );
}

function zodInputShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  if (schema instanceof z.ZodObject) {
    return schema.shape as Record<string, z.ZodTypeAny>;
  }
  return {};
}

function registerTagsToolOnMcpServer(
  server: McpServer,
  tagsTool: TagsTool,
  toolCtx: ToolContext,
): void {
  server.registerTool(
    tagsTool.name,
    {
      description: tagsTool.description,
      inputSchema: zodInputShape(tagsTool.inputSchema),
    },
    async (input) => {
      await toolCtx.emit({
        type: "tool.started",
        toolName: tagsTool.name,
        inputPreview: input,
      });

      try {
        const result = await tagsTool.execute(input, toolCtx);
        await toolCtx.emit({
          type: "tool.finished",
          toolName: tagsTool.name,
          outputPreview: result.modelOutput,
          uiCard: result.uiCard,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.modelOutput, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool execution failed";
        await toolCtx.emit({
          type: "tool.finished",
          toolName: tagsTool.name,
          outputPreview: { error: message },
        });
        return {
          isError: true,
          content: [{ type: "text", text: message }],
        };
      }
    },
  );
}

export async function handleTagsMcpRequest(
  request: Request,
  deps: {
    signingSecret: string;
    db: Db;
    providers: RuntimeProviders;
    providerConfig: RuntimeProviderConfig;
    appUrl: string;
  },
): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const claims = verifyTagsMcpRunToken(authHeader.slice("Bearer ".length), deps.signingSecret);
  if (!claims) {
    return new Response("Unauthorized", { status: 401 });
  }

  const emit = async (event: TagsEvent) => {
    await appendRunEvent(deps.db, claims.runId, event);
  };

  const toolCtx: ToolContext = {
    ...deps.providers,
    organizationId: claims.organizationId,
    workspaceId: claims.workspaceId,
    spaceId: claims.spaceId,
    channelId: claims.channelId,
    threadId: claims.threadId,
    runId: claims.runId,
    actorUserId: claims.actorSlackUserId,
    appUrl: deps.appUrl,
    emit,
  };

  const tools = resolveTools(deps.db, claims.enabledTools, {
    appUrl: deps.appUrl,
    providerConfig: deps.providerConfig,
    ...deps.providers,
  }).filter((tool) => !OPENCODE_MCP_EXCLUDED_TOOLS.has(tool.name));

  const server = new McpServer(
    { name: "tags", version: "1.0.0" },
    {
      instructions:
        "Tags native tools for the current Slack Space run. Use search_thread for current-thread context, search_memory for the Space MEMORY.md file, and session_search for prior threads in this Space.",
    },
  );

  for (const tagsTool of tools) {
    registerTagsToolOnMcpServer(server, tagsTool, toolCtx);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  return transport.handleRequest(request);
}
