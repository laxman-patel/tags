import { createMCPClient } from "@ai-sdk/mcp";
import { Composio } from "@composio/core";
import type { ToolSet } from "ai";

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
