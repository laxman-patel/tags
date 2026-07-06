import { createMCPClient } from "@ai-sdk/mcp";
import { Composio } from "@composio/core";
import type { Db } from "@tags/db";
import { appendRunEvent } from "@tags/core/runs";
import type { TagsEvent } from "@tags/core/events";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { gateSideEffectingTool } from "./approval-gate";
import { ApprovalPauseError } from "../agent/types";
import {
  createTagsMcpRunToken,
  verifyTagsMcpRunToken,
  type TagsMcpRunClaims,
} from "./tags-mcp-token";
import type { ComposioMcpServerConfig } from "./composio";
import type { RuntimeProviderConfig } from "../providers";

export type { ComposioMcpServerConfig };

export function createComposioMcpProxyConfig(args: {
  appUrl: string;
  token: string;
}): ComposioMcpServerConfig {
  return {
    type: "remote",
    url: `${args.appUrl.replace(/\/$/, "")}/api/mcp/composio`,
    enabled: true,
    headers: {
      Authorization: `Bearer ${args.token}`,
    },
    timeout: 30_000,
  };
}

export function buildComposioMcpRunToken(
  context: Omit<TagsMcpRunClaims, "exp">,
  signingSecret: string,
): string | null {
  if (!signingSecret) return null;
  if (!context.enabledConnections || context.enabledConnections.length === 0) return null;
  return createTagsMcpRunToken(context, signingSecret);
}

type ComposioToolDef = {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, unknown> };
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    title?: string;
  };
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type McpCallToolResult = Record<string, any> & {
  content: Array<Record<string, any>>;
  isError?: boolean;
};

const AUTO_APPROVED_COMPOSIO_INTERNAL_TOOLS = new Set([
  "multi_execute",
]);

function jsonSchemaToZodRawShape(
  schema: { properties?: Record<string, unknown> } | undefined,
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const props = schema?.properties;
  if (props && typeof props === "object") {
    for (const key of Object.keys(props)) {
      shape[key] = z.any();
    }
  }
  return shape;
}

export function isReadOnlyTool(tool: Pick<ComposioToolDef, "annotations">): boolean {
  return tool.annotations?.readOnlyHint === true;
}

export function isAutoApprovedComposioTool(
  tool: Pick<ComposioToolDef, "name" | "annotations">,
): boolean {
  return isReadOnlyTool(tool) || AUTO_APPROVED_COMPOSIO_INTERNAL_TOOLS.has(tool.name.toLowerCase());
}

export async function handleComposioMcpRequest(
  request: Request,
  deps: {
    signingSecret: string;
    db: Db;
    providerConfig: RuntimeProviderConfig;
    appUrl: string;
  },
): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const claims = verifyTagsMcpRunToken(
    authHeader.slice("Bearer ".length),
    deps.signingSecret,
  );
  if (!claims) {
    return new Response("Unauthorized", { status: 401 });
  }

  const toolkits = claims.enabledConnections ?? [];
  const apiKey = deps.providerConfig.composioApiKey ?? "";
  if (!apiKey || toolkits.length === 0) {
    return new Response("Composio not configured", { status: 503 });
  }

  const composio = new Composio({ apiKey });
  const session = await composio.create(claims.spaceId, {
    mcp: true,
    toolkits,
  });

  const mcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: session.mcp.url,
      headers: session.mcp.headers,
    },
  });

  const listResult = await mcpClient.listTools();
  const tools = (listResult.tools ?? []) as unknown as ComposioToolDef[];

  const emit = async (event: TagsEvent) => {
    await appendRunEvent(deps.db, claims.runId, event);
  };

  const server = new McpServer(
    { name: "composio", version: "1.0.0" },
    {
      instructions:
        "Composio-connected tools for this Space. Read-only and Composio-internal orchestration tools execute automatically; write/delete/edit app tools require human approval.",
    },
  );

  for (const tool of tools) {
    const autoApproved = isAutoApprovedComposioTool(tool);
    const gatedName = `composio.${tool.name}`;

    server.registerTool(
      tool.name,
      {
        description: tool.description ?? tool.name,
        inputSchema: jsonSchemaToZodRawShape(tool.inputSchema),
        annotations: tool.annotations,
      },
      (async (input: Record<string, unknown>): Promise<McpCallToolResult> => {
        await emit({
          type: "tool.started",
          toolName: gatedName,
          inputPreview: input,
        });

        if (autoApproved) {
          try {
            const result = await mcpClient.callTool({
              name: tool.name,
              arguments: input,
            });
            await emit({
              type: "tool.finished",
              toolName: gatedName,
              outputPreview: result,
            });
            return result as McpCallToolResult;
          } catch (error) {
            const message = error instanceof Error ? error.message : "Composio tool failed";
            await emit({
              type: "tool.finished",
              toolName: gatedName,
              outputPreview: { error: message },
            });
            return {
              isError: true,
              content: [{ type: "text", text: message }],
            };
          }
        }

        try {
          await gateSideEffectingTool({
            db: deps.db,
            runId: claims.runId,
            organizationId: claims.organizationId,
            spaceId: claims.spaceId,
            threadId: claims.threadId,
            toolName: gatedName,
            toolInput: input,
            actorUserId: claims.actorSlackUserId,
            slackChannelId: claims.channelId,
            slackMessageTs: claims.slackMessageTs,
            emit,
          });

          const result = await mcpClient.callTool({
            name: tool.name,
            arguments: input,
          });
          await emit({
            type: "tool.finished",
            toolName: gatedName,
            outputPreview: result,
          });
          return result as McpCallToolResult;
        } catch (error) {
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
          const message = error instanceof Error ? error.message : "Composio tool failed";
          await emit({
            type: "tool.finished",
            toolName: gatedName,
            outputPreview: { error: message },
          });
          return {
            isError: true,
            content: [{ type: "text", text: message }],
          };
        }
      }) as any,
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  const response = await transport.handleRequest(request);

  mcpClient.close().catch(() => {});

  return response;
}
