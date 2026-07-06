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
  const normalizedStatus = args.accountStatus?.trim().toLowerCase();
  if (
    normalizedStatus === "active" ||
    normalizedStatus === "connected" ||
    normalizedStatus === "enabled"
  ) {
    return "connected";
  }
  if (args.accountStatus) return "needs_auth";
  return "needs_auth";
}

function normalizedConnectedAccountStatus(status: string | null | undefined) {
  return status?.trim().toUpperCase() ?? "";
}

function isActiveConnectedAccountStatus(status: string | null | undefined) {
  const normalizedStatus = normalizedConnectedAccountStatus(status);
  return (
    normalizedStatus === "ACTIVE" ||
    normalizedStatus === "CONNECTED" ||
    normalizedStatus === "ENABLED"
  );
}

function connectedAccountStatusRank(status: string | null | undefined) {
  const normalizedStatus = normalizedConnectedAccountStatus(status);
  if (isActiveConnectedAccountStatus(normalizedStatus)) return 100;
  if (normalizedStatus === "INITIATED" || normalizedStatus === "INITIALIZING") return 50;
  if (normalizedStatus === "INACTIVE") return 20;
  if (normalizedStatus === "FAILED" || normalizedStatus === "EXPIRED" || normalizedStatus === "REVOKED") return 10;
  return normalizedStatus ? 1 : 0;
}

function bestConnectedAccountStatus(current: string | undefined, next: string) {
  return connectedAccountStatusRank(next) > connectedAccountStatusRank(current) ? next : current;
}

/**
 * Starts Composio OAuth for a toolkit scoped to the Space entity id.
 * Returns the hosted connect URL from `session.authorize()`.
 */
export async function authorizeComposioToolkit(args: {
  apiKey: string;
  entityId: string;
  toolkit: string;
  callbackUrl?: string;
}): Promise<{ connectUrl: string | null; connectionId: string | null }> {
  if (!args.apiKey) return { connectUrl: null, connectionId: null };

  const composio = new Composio({ apiKey: args.apiKey });
  const session = await composio.create(args.entityId, {
    mcp: true,
    toolkits: [args.toolkit],
  });
  const connection = await session.authorize(
    args.toolkit,
    args.callbackUrl ? { callbackUrl: args.callbackUrl } : undefined,
  );

  return { connectUrl: connection.redirectUrl ?? null, connectionId: connection.id ?? null };
}

export async function listComposioConnectedAccountStatuses(args: {
  apiKey: string;
  entityId: string;
}): Promise<Record<string, string>> {
  if (!args.apiKey) return {};

  const composio = new Composio({ apiKey: args.apiKey });
  const { items } = await composio.connectedAccounts.list({
    userIds: [args.entityId],
    accountType: "ALL",
  });
  const statuses: Record<string, string> = {};

  for (const item of items) {
    const slug = item.toolkit?.slug?.trim().toLowerCase();
    if (!slug) continue;
    const status = item.isDisabled ? "INACTIVE" : item.status;
    statuses[slug] = bestConnectedAccountStatus(statuses[slug], status) ?? status;
  }

  return statuses;
}

export type ComposioToolsHandle = {
  tools: ToolSet;
  /** Closes the underlying MCP transport. Always call this when the run segment ends. */
  close: () => Promise<void>;
};

export type ComposioToolkitDirectoryItem = {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
  categories: string[];
  toolsCount?: number;
  noAuth?: boolean;
};

export async function listComposioToolkits(args: {
  apiKey: string;
  limit?: number;
}): Promise<ComposioToolkitDirectoryItem[]> {
  if (!args.apiKey) return [];

  const composio = new Composio({ apiKey: args.apiKey });
  const toolkits = await composio.toolkits.get({
    managedBy: "all",
    sortBy: "usage",
    limit: args.limit ?? 500,
  });

  return toolkits.map((toolkit) => ({
    id: toolkit.slug,
    name: toolkit.name,
    description: toolkit.meta.description ?? `Connect ${toolkit.name} through Composio.`,
    logoUrl: toolkit.meta.logo,
    categories: toolkit.meta.categories?.map((category) => category.name) ?? [],
    toolsCount: toolkit.meta.toolsCount,
    noAuth: toolkit.noAuth,
  }));
}

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

export type ComposioActionSummary = {
  slug: string;
  name: string;
  description: string;
  readOnly: boolean;
};

/**
 * Lists the individual actions (subtools) a toolkit exposes, via the same MCP
 * session the runtime uses — so the slugs returned here match the keys the
 * approval gate checks against exactly.
 */
export async function listComposioToolkitActions(args: {
  apiKey: string;
  entityId: string;
  toolkit: string;
}): Promise<ComposioActionSummary[]> {
  const session = await createComposioMcpServer({
    apiKey: args.apiKey,
    entityId: args.entityId,
    toolkits: [args.toolkit],
  });
  if (!session) return [];

  const mcpClient = await createMCPClient({
    transport: { type: "http", url: session.url, headers: session.headers },
  });

  try {
    const listResult = await mcpClient.listTools();
    const tools = (listResult.tools ?? []) as unknown as Array<{
      name: string;
      description?: string;
      annotations?: { readOnlyHint?: boolean; title?: string };
    }>;
    const internal = new Set(["multi_execute", "composio_manage_connections"]);
    return tools
      .filter((tool) => !internal.has(tool.name.toLowerCase()))
      .map((tool) => ({
        slug: tool.name,
        name: tool.annotations?.title ?? tool.name,
        description: tool.description ?? "",
        readOnly: tool.annotations?.readOnlyHint === true,
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
  } finally {
    await mcpClient.close().catch(() => {});
  }
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
