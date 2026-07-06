import { appendRunEvent } from "@tags/core/runs";
import type { TagsEvent } from "@tags/core/events";
import { eq, workspaces, type Db } from "@tags/db";
import { decryptSlackBotToken } from "@tags/core/slack-installations";
import {
  NATIVE_APPROVABLE_TOOLS,
  listApprovalRequiredToolKeys,
  toolApprovalKey,
} from "@tags/core/tool-approvals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { ComposioMcpServerConfig } from "./composio";
import { gateSideEffectingTool } from "./approval-gate";
import { resolveTools } from "./registry";
import type { TagsTool, ToolContext } from "./types";
import {
  createTagsMcpRunToken,
  type TagsMcpRunClaims,
  verifyTagsMcpRunToken,
} from "./tags-mcp-token";
import { createRuntimeProviders, type RuntimeProviderConfig, type RuntimeProviders } from "../providers";
import { ApprovalPauseError, QuestionPauseError } from "../agent/types";

const NATIVE_RISK_BY_ID = new Map(
  NATIVE_APPROVABLE_TOOLS.map((tool) => [tool.id, tool.risk] as const),
);

/** Native tools that cannot run inside the opencode sandbox MCP bridge. */
export const OPENCODE_MCP_EXCLUDED_TOOLS = new Set([
  "run_coding_agent",
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
  deps: { db: Db; requiresApproval: boolean },
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
        if (deps.requiresApproval) {
          // Throws ApprovalPauseError (creates the request + pauses the run)
          // unless this exact call was already approved.
          const gate = await gateSideEffectingTool({
            db: deps.db,
            runId: toolCtx.runId,
            organizationId: toolCtx.organizationId,
            spaceId: toolCtx.spaceId,
            threadId: toolCtx.threadId,
            toolName: tagsTool.name,
            toolInput: input,
            actorUserId: toolCtx.actorUserId,
            slackChannelId: toolCtx.channelId,
            riskLevel: NATIVE_RISK_BY_ID.get(tagsTool.name) ?? "medium",
            emit: toolCtx.emit,
          });

          // Already approved and executed earlier in this run: return the stored
          // result instead of running the tool again.
          if (gate.cachedResult !== undefined) {
            await toolCtx.emit({
              type: "tool.finished",
              toolName: tagsTool.name,
              outputPreview: gate.cachedResult,
            });
            return {
              content: [
                { type: "text", text: JSON.stringify(gate.cachedResult, null, 2) },
              ],
            };
          }
        }

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
        if (error instanceof QuestionPauseError) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `[TAGS_PAUSE:question] The run has been paused to ask the human a question. Stop and wait for the answer.`,
              },
            ],
          };
        }
        if (error instanceof ApprovalPauseError) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `[TAGS_PAUSE:approval] The run has been paused for human approval. Stop and wait for the decision.`,
              },
            ],
          };
        }
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
    providers?: RuntimeProviders;
    providerConfig: RuntimeProviderConfig;
    encryptionKey?: string;
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

  let providerConfig = deps.providerConfig;
  if (!providerConfig.slackBotToken) {
    const rows = await deps.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, claims.workspaceId))
      .limit(1);
    const workspace = rows[0];
    if (workspace?.botAccessTokenCiphertext) {
      if (!deps.encryptionKey) {
        return new Response("Slack token encryption key is not configured", { status: 500 });
      }
      providerConfig = {
        ...providerConfig,
        slackBotToken: decryptSlackBotToken(workspace, deps.encryptionKey),
      };
    }
  }

  const providers = deps.providers ?? (await createRuntimeProviders(providerConfig));

  const emit = async (event: TagsEvent) => {
    await appendRunEvent(deps.db, claims.runId, event);
  };

  const toolCtx: ToolContext = {
    ...providers,
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
    providerConfig,
    ...providers,
  }).filter((tool) => !OPENCODE_MCP_EXCLUDED_TOOLS.has(tool.name));

  // Approval is opt-in per Space: a native tool only pauses when its key is in
  // space_tool_approvals. By default nothing requires approval.
  const approvalKeys = await listApprovalRequiredToolKeys(deps.db, claims.spaceId);

  const server = new McpServer(
    { name: "tags", version: "1.0.0" },
    {
      instructions:
        "Tags native tools for the current Slack Space run. Use search_thread for current-thread context, search_memory for the Space MEMORY.md file, and session_search for prior threads in this Space.",
    },
  );

  for (const tagsTool of tools) {
    const requiresApproval = approvalKeys.has(toolApprovalKey("native", tagsTool.name));
    registerTagsToolOnMcpServer(server, tagsTool, toolCtx, {
      db: deps.db,
      requiresApproval,
    });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  return transport.handleRequest(request);
}
