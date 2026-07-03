import { createMCPClient } from "@ai-sdk/mcp";
import { Composio } from "@composio/core";
import type { ToolSet } from "ai";

export type ComposioToolkitConnectionStatus =
  | "missing_api_key"
  | "available"
  | "enabled"
  | "needs_auth"
  | "connected";

export function resolveToolkitConnectionStatus(args: {
  hasApiKey: boolean;
  enabled: boolean;
  accountStatus?: string | null;
}): ComposioToolkitConnectionStatus {
  if (!args.hasApiKey) return "missing_api_key";
  if (!args.enabled) return "available";
  if (args.accountStatus === "ACTIVE") return "connected";
  if (args.accountStatus) return "needs_auth";
  return "needs_auth";
}

/**
 * Starts Composio OAuth for a toolkit scoped to the Space entity id.
 * Returns the hosted connect URL from `session.authorize()`.
 */
export async function authorizeComposioToolkit(args: {
  apiKey: string;
  entityId: string;
  toolkit: string;
}): Promise<{ connectUrl: string | null }> {
  if (!args.apiKey) return { connectUrl: null };

  const composio = new Composio({ apiKey: args.apiKey });
  const session = await composio.create(args.entityId, {
    mcp: true,
    toolkits: [args.toolkit],
  });
  const connection = await session.authorize(args.toolkit);

  return { connectUrl: connection.redirectUrl ?? null };
}

export async function listComposioConnectedAccountStatuses(args: {
  apiKey: string;
  entityId: string;
}): Promise<Record<string, string>> {
  if (!args.apiKey) return {};

  const composio = new Composio({ apiKey: args.apiKey });
  const { items } = await composio.connectedAccounts.list({ userIds: [args.entityId] });
  const statuses: Record<string, string> = {};

  for (const item of items) {
    const slug = item.toolkit?.slug;
    if (!slug) continue;
    statuses[slug] = item.status;
  }

  return statuses;
}

export type ComposioToolsHandle = {
  tools: ToolSet;
  /** Closes the underlying MCP transport. Always call this when the run segment ends. */
  close: () => Promise<void>;
};

export type ComposioMcpServerConfig = {
  type: "remote";
  url: string;
  enabled: true;
  headers?: Record<string, string>;
  timeout: number;
};

/**
 * Loads Composio tools for a Space via the Tool Router session + MCP transport.
 *
 * We use the MCP route (not `@composio/vercel`) because the Composio Vercel
 * provider peer-depends on `ai@^5 || ^6`, while this repo runs `ai@7`. The AI
 * SDK 7 MCP client (`@ai-sdk/mcp`) produces v7-native tools from the session's
 * MCP endpoint.
 *
 * The entity (`entityId`) is the Space id, so connected accounts are scoped per
 * channel. Toolkits come from the Space config's `enabledConnections`.
 */
export async function createComposioMcpServer(args: {
  apiKey: string;
  entityId: string;
  toolkits: string[];
}): Promise<ComposioMcpServerConfig | null> {
  if (!args.apiKey || args.toolkits.length === 0) {
    return null;
  }

  const composio = new Composio({ apiKey: args.apiKey });
  const session = await composio.create(args.entityId, {
    mcp: true,
    toolkits: args.toolkits,
  });

  return {
    type: "remote",
    url: session.mcp.url,
    enabled: true,
    headers: session.mcp.headers,
    timeout: 30_000,
  };
}

export async function loadComposioTools(args: {
  apiKey: string;
  entityId: string;
  toolkits: string[];
}): Promise<ComposioToolsHandle | null> {
  if (!args.apiKey || args.toolkits.length === 0) {
    return null;
  }

  const session = await createComposioMcpServer(args);
  if (!session) return null;

  const mcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: session.url,
      headers: session.headers,
    },
  });

  const tools = (await mcpClient.tools()) as ToolSet;

  return {
    tools,
    close: () => mcpClient.close(),
  };
}
