export const NATIVE_TOOLS = [
  {
    id: "search_thread",
    label: "Search thread",
    description: "Read recent conversation context in the current Slack thread.",
  },
  {
    id: "search_memory",
    label: "Search memory",
    description: "Search long-term Space memory.",
  },
  {
    id: "save_memory",
    label: "Save memory",
    description: "Store channel-scoped facts and preferences.",
  },
  {
    id: "create_artifact",
    label: "Create artifact",
    description: "Publish durable markdown, JSON, tables, links, and diffs.",
  },
  {
    id: "ask_user",
    label: "Ask user",
    description: "Pause and ask a human for missing information.",
  },
  {
    id: "create_schedule",
    label: "Create schedule",
    description: "Create recurring Space tasks.",
  },
  {
    id: "run_coding_agent",
    label: "Run coding agent",
    description: "Use the persistent Space sandbox for approved coding work.",
  },
] as const;

export const COMPOSIO_TOOLKITS = [
  {
    id: "github",
    label: "GitHub",
    description: "Repository issues, PRs, branches, and code collaboration.",
  },
  {
    id: "linear",
    label: "Linear",
    description: "Issues, projects, teams, and product work tracking.",
  },
  {
    id: "slack",
    label: "Slack",
    description: "Workspace search and channel actions outside native bot events.",
  },
  {
    id: "notion",
    label: "Notion",
    description: "Docs, pages, and lightweight knowledge bases.",
  },
  {
    id: "google-drive",
    label: "Google Drive",
    description: "Docs and files shared with the channel agent.",
  },
] as const;

export function toolkitLabel(id: string) {
  return COMPOSIO_TOOLKITS.find((toolkit) => toolkit.id === id)?.label ?? id;
}
