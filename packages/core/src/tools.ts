export const ALWAYS_ENABLED_NATIVE_TOOLS = [
  "search_thread",
  "search_channel",
  "search_memory",
  "save_memory",
  "session_search",
  "create_artifact",
  "run_coding_agent",
  "ask_user",
  "create_schedule",
] as const;

export type NativeToolId = (typeof ALWAYS_ENABLED_NATIVE_TOOLS)[number];

export type NativeToolMetadata = {
  id: NativeToolId;
  name: string;
  description: string;
  provider: "Tags" | "Slack";
};

export const NATIVE_TOOL_METADATA: Record<NativeToolId, NativeToolMetadata> = {
  search_thread: {
    id: "search_thread",
    name: "Thread search",
    description: "Read context from the current Slack thread.",
    provider: "Tags",
  },
  search_channel: {
    id: "search_channel",
    name: "Channel search",
    description: "Read recent Slack channel history.",
    provider: "Slack",
  },
  search_memory: {
    id: "search_memory",
    name: "Memory search",
    description: "Read durable notes saved for this Space.",
    provider: "Tags",
  },
  save_memory: {
    id: "save_memory",
    name: "Save memory",
    description: "Persist durable Space memory after a run.",
    provider: "Tags",
  },
  session_search: {
    id: "session_search",
    name: "Session search",
    description: "Find prior coding sessions in this Space.",
    provider: "Tags",
  },
  create_artifact: {
    id: "create_artifact",
    name: "Artifacts",
    description: "Create files, reports, and rich run artifacts.",
    provider: "Tags",
  },
  run_coding_agent: {
    id: "run_coding_agent",
    name: "Coding agent",
    description: "Run repo-aware coding work in a sandbox.",
    provider: "Tags",
  },
  ask_user: {
    id: "ask_user",
    name: "Ask user",
    description: "Pause a run to ask the human a question.",
    provider: "Tags",
  },
  create_schedule: {
    id: "create_schedule",
    name: "Schedules",
    description: "Create recurring Space tasks after approval.",
    provider: "Tags",
  },
};

const nativeToolIds = new Set<string>(ALWAYS_ENABLED_NATIVE_TOOLS);

export function isNativeToolId(toolId: string): toolId is NativeToolId {
  return nativeToolIds.has(toolId);
}

export function alwaysEnabledNativeTools(): NativeToolId[] {
  return [...ALWAYS_ENABLED_NATIVE_TOOLS];
}
