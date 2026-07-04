export type SpaceCapabilities = {
  spaceName: string;
  enabledTools: readonly string[];
  enabledConnections: readonly string[];
  hasComposioApiKey: boolean;
};

const NATIVE_TOOL_DESCRIPTIONS: Record<string, string> = {
  search_thread: "read recent conversation context in the current Slack thread",
  search_channel: "read recent top-level messages in this Slack channel",
  search_memory: "search the Space MEMORY.md file",
  save_memory: "edit the Space MEMORY.md file",
  session_search: "search prior Slack threads in this Space",
  create_artifact: "publish durable markdown, JSON, HTML, links, and diffs",
  ask_user: "pause and ask a human for missing information",
  create_schedule: "create recurring Space tasks with approval",
  run_coding_agent: "use the persistent Space sandbox for approved coding work",
};

const CONNECTION_LABELS: Record<string, string> = {
  github: "GitHub",
  linear: "Linear",
  slack: "Slack",
  notion: "Notion",
  "google-drive": "Google Drive",
};

function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/<@[^>]+>/g, " ")
    .replace(/@tags/g, " ")
    .replace(/[^\p{L}\p{N}_?]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCapabilityInventoryQuestion(text: string): boolean {
  const normalized = normalizeQuestion(text);
  if (!normalized) return false;

  return [
    /\bwhat\b.*\b(tools?|connections?|toolkits?)\b.*\b(access|available|enabled|have)\b/,
    /\bwhat\b.*\b(access|available|enabled)\b.*\b(tools?|connections?|toolkits?)\b/,
    /\bdo you have access to\b.*\b(tools?|connections?|toolkits?)\b/,
    /\b(which|list|show)\b.*\b(tools?|connections?|toolkits?|capabilit(?:y|ies)|access)\b/,
    /\btell me\b.*\b(tools?|connections?|toolkits?|capabilit(?:y|ies)|access)\b/,
    /\bwhat can you do\b/,
    /\bcapabilit(?:y|ies)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function formatNativeTool(id: string): string {
  const description = NATIVE_TOOL_DESCRIPTIONS[id];
  return description ? `- ${id}: ${description}` : `- ${id}`;
}

function formatConnection(id: string): string {
  const label = CONNECTION_LABELS[id] ?? id;
  return label === id ? `- ${id}` : `- ${label} (${id})`;
}

function formatList(items: readonly string[], formatter: (item: string) => string): string {
  if (items.length === 0) return "- None enabled.";
  return items.map(formatter).join("\n");
}

export function buildCapabilitiesReply(capabilities: SpaceCapabilities): string {
  const connectionHeader =
    capabilities.enabledConnections.length === 0
      ? "Connected toolkits:"
      : capabilities.hasComposioApiKey
        ? "Connected Composio toolkits exposed to the Space:"
        : "Configured Composio toolkits (currently unavailable because COMPOSIO_API_KEY is missing):";

  return [
    `I'm Tags for the #${capabilities.spaceName} Space. I can read and reply in this Slack thread, use this Space's memory/context, call native Tags tools through the tags MCP server, and run approved coding work in the persistent Space sandbox through opencode.`,
    "",
    "Enabled native tools:",
    formatList(capabilities.enabledTools, formatNativeTool),
    "",
    connectionHeader,
    formatList(capabilities.enabledConnections, formatConnection),
    "",
    "High-impact external side effects still go through the Space approval policy.",
  ].join("\n");
}
