import { createMCPClient } from "@ai-sdk/mcp";
import { Composio } from "@composio/core";
import type { Db } from "@tags/db";
import { appendRunEvent } from "@tags/core/runs";
import {
  composioToolApprovalKey,
  listApprovalRequiredToolKeys,
} from "@tags/core/tool-approvals";
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
  inputSchema?: JsonSchema;
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

/**
 * Composio's own orchestration tools. These are never app side effects (they
 * batch calls or manage connections) so they always run without approval,
 * regardless of Space configuration.
 */
const COMPOSIO_INTERNAL_TOOLS = new Set(["multi_execute", "composio_manage_connections"]);

export function isComposioInternalTool(name: string): boolean {
  return COMPOSIO_INTERNAL_TOOLS.has(name.toLowerCase());
}

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, unknown>;
  items?: unknown;
  required?: string[];
};

function asJsonSchema(value: unknown): JsonSchema | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as JsonSchema;
}

function jsonSchemaType(schema: JsonSchema | undefined): string | undefined {
  const type = schema?.type;
  if (Array.isArray(type)) return type.find((item) => item !== "null");
  return type;
}

function jsonSchemaToZod(schema: unknown): z.ZodTypeAny {
  const jsonSchema = asJsonSchema(schema);
  switch (jsonSchemaType(jsonSchema)) {
    case "boolean":
      return z.boolean();
    case "integer":
      return z.number().int();
    case "number":
      return z.number();
    case "string":
      return z.string();
    case "array":
      return z.array(jsonSchemaToZod(jsonSchema?.items));
    case "object":
      return jsonSchema?.properties
        ? z.object(jsonSchemaToZodRawShape(jsonSchema)).passthrough()
        : z.record(z.string(), z.any());
    default:
      return z.any();
  }
}

export function jsonSchemaToZodRawShape(schema: JsonSchema | undefined): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const props = schema?.properties;
  const required = new Set(schema?.required ?? []);
  if (props && typeof props === "object") {
    for (const key of Object.keys(props)) {
      const zodSchema = jsonSchemaToZod(props[key]);
      shape[key] = required.has(key) ? zodSchema : zodSchema.optional();
    }
  }
  return shape;
}

function coerceValueForJsonSchema(value: unknown, schema: unknown): unknown {
  const jsonSchema = asJsonSchema(schema);
  switch (jsonSchemaType(jsonSchema)) {
    case "boolean":
      if (value === "true") return true;
      if (value === "false") return false;
      return value;
    case "integer":
    case "number":
      return typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    case "array": {
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            return parsed.map((item) => coerceValueForJsonSchema(item, jsonSchema?.items));
          }
        } catch {
          return [coerceValueForJsonSchema(value, jsonSchema?.items)];
        }
      }
      return Array.isArray(value)
        ? value.map((item) => coerceValueForJsonSchema(item, jsonSchema?.items))
        : value;
    }
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const props = jsonSchema?.properties ?? {};
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          coerceValueForJsonSchema(item, props[key]),
        ]),
      );
    }
    default:
      return value;
  }
}

export function coerceInputForJsonSchema(
  input: Record<string, unknown>,
  schema: JsonSchema | undefined,
): Record<string, unknown> {
  const props = schema?.properties ?? {};
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      coerceValueForJsonSchema(value, props[key]),
    ]),
  );
}

export function isReadOnlyTool(tool: Pick<ComposioToolDef, "annotations">): boolean {
  return tool.annotations?.readOnlyHint === true;
}

function composioToolRisk(tool: Pick<ComposioToolDef, "annotations">): "medium" | "high" {
  return tool.annotations?.destructiveHint === true ? "high" : "medium";
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

  // Approval is opt-in per Space: a tool only pauses for a human when its key is
  // present in space_tool_approvals. By default every tool runs immediately.
  const approvalKeys = await listApprovalRequiredToolKeys(deps.db, claims.spaceId);

  const emit = async (event: TagsEvent) => {
    await appendRunEvent(deps.db, claims.runId, event);
  };

  const server = new McpServer(
    { name: "composio", version: "1.0.0" },
    {
      instructions:
        "Composio-connected tools for this Space. Tools run immediately unless an admin has marked them as requiring approval, in which case they pause for a human decision in Slack and the Tags dashboard.",
    },
  );

  for (const tool of tools) {
    const requiresApproval =
      !isComposioInternalTool(tool.name) &&
      approvalKeys.has(composioToolApprovalKey(tool.name));
    const gatedName = `composio.${tool.name}`;

    server.registerTool(
      tool.name,
      {
        description: tool.description ?? tool.name,
        inputSchema: jsonSchemaToZodRawShape(tool.inputSchema),
        annotations: tool.annotations,
      },
      (async (input: Record<string, unknown>): Promise<McpCallToolResult> => {
        const coercedInput = coerceInputForJsonSchema(input, tool.inputSchema);
        await emit({
          type: "tool.started",
          toolName: gatedName,
          inputPreview: coercedInput,
        });

        if (!requiresApproval) {
          try {
            const result = await mcpClient.callTool({
              name: tool.name,
              arguments: coercedInput,
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
          const gate = await gateSideEffectingTool({
            db: deps.db,
            runId: claims.runId,
            organizationId: claims.organizationId,
            spaceId: claims.spaceId,
            threadId: claims.threadId,
            toolName: gatedName,
            toolInput: coercedInput,
            actorUserId: claims.actorSlackUserId,
            slackChannelId: claims.channelId,
            slackMessageTs: claims.slackMessageTs,
            riskLevel: composioToolRisk(tool),
            emit,
          });

          // Already approved and executed earlier in this run: return the stored
          // result instead of calling the tool a second time.
          if (gate.cachedResult !== undefined) {
            await emit({
              type: "tool.finished",
              toolName: gatedName,
              outputPreview: gate.cachedResult,
            });
            return gate.cachedResult as McpCallToolResult;
          }

          const result = await mcpClient.callTool({
            name: tool.name,
            arguments: coercedInput,
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
