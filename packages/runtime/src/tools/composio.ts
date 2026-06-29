import { createMCPClient } from "@ai-sdk/mcp";
import { Composio } from "@composio/core";
import type { ToolSet } from "ai";

export type ComposioToolsHandle = {
  tools: ToolSet;
  /** Closes the underlying MCP transport. Always call this when the run segment ends. */
  close: () => Promise<void>;
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
 *
 * NOTE: Composio tools are only loaded in orchestrator mode (`runtimeMode`).
 * On opencode-primary runs they are disabled entirely. In orchestrator mode,
 * each MCP tool is wrapped with Tags approval gating (see composio-governance.ts).
 */
export async function loadComposioTools(args: {
  apiKey: string;
  entityId: string;
  toolkits: string[];
}): Promise<ComposioToolsHandle | null> {
  if (!args.apiKey || args.toolkits.length === 0) {
    return null;
  }

  const composio = new Composio({ apiKey: args.apiKey });
  const session = await composio.create(args.entityId, {
    mcp: true,
    toolkits: args.toolkits,
  });

  const mcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: session.mcp.url,
      headers: session.mcp.headers,
    },
  });

  const tools = (await mcpClient.tools()) as ToolSet;

  return {
    tools,
    close: () => mcpClient.close(),
  };
}
