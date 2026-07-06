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
  const enabledConnections = normalizeComposioToolkits(context.enabledConnections);
  if (enabledConnections.length === 0) return null;
  return createTagsMcpRunToken({ ...context, enabledConnections }, signingSecret);
}

/**
 * A single Composio action as returned by `getRawComposioTools`. These are the
 * real app actions (e.g. GITHUB_CREATE_AN_ISSUE), not tool-router meta tools, so
 * opencode calls them by name and the approval gate can match them per-action.
 */
export type ComposioRawTool = {
  slug: string;
  name: string;
  description?: string;
  inputParameters?: JsonSchema;
};

type ComposioExecuteResponse = {
  data: Record<string, unknown>;
  error: string | null;
  successful: boolean;
  logId?: string;
};

type ComposioToolClient = {
  create: (userId: string, options: { mcp: true; toolkits: string[] }) => Promise<unknown>;
  tools: {
    getRawComposioTools: (options: { toolkits: string[]; limit: number }) => Promise<unknown>;
    execute: (slug: string, options: {
      userId: string;
      arguments: Record<string, unknown>;
      dangerouslySkipVersionCheck: true;
    }) => Promise<unknown>;
  };
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type McpCallToolResult = Record<string, any> & {
  content: Array<Record<string, any>>;
  isError?: boolean;
};

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

export function normalizeComposioToolkits(toolkits: readonly string[] | undefined): string[] {
  return Array.from(
    new Set(
      (toolkits ?? [])
        .map((toolkit) => toolkit.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

const READ_ONLY_ACTION_VERBS = new Set([
  "GET",
  "LIST",
  "SEARCH",
  "FIND",
  "FETCH",
  "READ",
  "RETRIEVE",
  "COUNT",
  "CHECK",
]);

/**
 * Composio slugs are `TOOLKIT_VERB_...`. A read verb means the action doesn't
 * mutate state — used only to pick a sensible default risk for the approval
 * card. Gating itself never depends on this.
 */
export function isReadOnlyComposioActionSlug(slug: string): boolean {
  return slug
    .toUpperCase()
    .split("_")
    .some((word) => READ_ONLY_ACTION_VERBS.has(word));
}

function composioActionRisk(slug: string): "low" | "medium" {
  return isReadOnlyComposioActionSlug(slug) ? "low" : "medium";
}

function toolExecuteResponseToMcpResult(response: ComposioExecuteResponse): McpCallToolResult {
  if (response.successful === false) {
    return {
      isError: true,
      content: [{ type: "text", text: response.error ?? "Composio tool failed" }],
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(response.data ?? {}) }],
  };
}

export async function executeComposioAction(
  composio: ComposioToolClient,
  args: {
    spaceId: string;
    slug: string;
    input: Record<string, unknown>;
  },
): Promise<McpCallToolResult> {
  const response = (await composio.tools.execute(args.slug, {
    userId: args.spaceId,
    arguments: args.input,
    dangerouslySkipVersionCheck: true,
  })) as ComposioExecuteResponse;
  return toolExecuteResponseToMcpResult(response);
}

export async function executeComposioActionForSpace(args: {
  apiKey: string;
  spaceId: string;
  toolkits: string[];
  slug: string;
  input: Record<string, unknown>;
}): Promise<McpCallToolResult> {
  const toolkits = normalizeComposioToolkits(args.toolkits);
  if (!args.apiKey || toolkits.length === 0) {
    return {
      isError: true,
      content: [{ type: "text", text: "Composio not configured" }],
    };
  }

  const composio = new Composio({ apiKey: args.apiKey }) as ComposioToolClient;
  await composio.create(args.spaceId, {
    mcp: true,
    toolkits,
  });
  return executeComposioAction(composio, {
    spaceId: args.spaceId,
    slug: args.slug,
    input: args.input,
  });
}

export async function listComposioMcpToolsForSpace(args: {
  composio: ComposioToolClient;
  spaceId: string;
  toolkits: string[];
}): Promise<ComposioRawTool[]> {
  await args.composio.create(args.spaceId, {
    mcp: true,
    toolkits: args.toolkits,
  });

  return (await args.composio.tools.getRawComposioTools({
    toolkits: args.toolkits,
    limit: 500,
  })) as ComposioRawTool[];
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

  const toolkits = normalizeComposioToolkits(claims.enabledConnections);
  const apiKey = deps.providerConfig.composioApiKey ?? "";
  if (!apiKey || toolkits.length === 0) {
    return new Response("Composio not configured", { status: 503 });
  }

  const composio = new Composio({ apiKey }) as ComposioToolClient;
  // Expose the toolkits' real actions directly (not the tool-router meta tools)
  // so opencode calls each action by name and the approval gate can match it
  // per-action against space_tool_approvals. Creating the Space-scoped session
  // first ensures Composio binds these actions to the connected account for
  // this Space entity.
  const tools = await listComposioMcpToolsForSpace({
    composio,
    spaceId: claims.spaceId,
    toolkits,
  });

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

  const executeComposioTool = async (
    slug: string,
    input: Record<string, unknown>,
  ): Promise<McpCallToolResult> => {
    return executeComposioAction(composio, {
      spaceId: claims.spaceId,
      slug,
      input,
    });
  };

  for (const tool of tools) {
    const slug = tool.slug;
    const inputSchema = tool.inputParameters;
    const requiresApproval = approvalKeys.has(composioToolApprovalKey(slug));
    const gatedName = `composio.${slug}`;

    server.registerTool(
      slug,
      {
        description: tool.description ?? tool.name ?? slug,
        inputSchema: jsonSchemaToZodRawShape(inputSchema),
        annotations: {
          title: tool.name ?? slug,
          readOnlyHint: isReadOnlyComposioActionSlug(slug),
        },
      },
      (async (input: Record<string, unknown>): Promise<McpCallToolResult> => {
        const coercedInput = coerceInputForJsonSchema(input, inputSchema);
        await emit({
          type: "tool.started",
          toolName: gatedName,
          inputPreview: coercedInput,
        });

        if (!requiresApproval) {
          try {
            const result = await executeComposioTool(slug, coercedInput);
            await emit({
              type: "tool.finished",
              toolName: gatedName,
              outputPreview: result,
            });
            return result;
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
            riskLevel: composioActionRisk(slug),
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

          const result = await executeComposioTool(slug, coercedInput);
          await emit({
            type: "tool.finished",
            toolName: gatedName,
            outputPreview: result,
          });
          return result;
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

  return response;
}
