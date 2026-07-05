export type ToolAuthState = "connected" | "requires_auth" | "not_authenticated";
export type SpaceStatus = "active" | "paused" | "error";
export type RunStatus = "success" | "running" | "failed" | "pending";
export type RunEventType = "start" | "tool_call" | "approval" | "error" | "artifact" | "end";

export interface Tool {
  id: string;
  name: string;
  description: string;
  provider: string;
  enabled: boolean;
  authState: ToolAuthState;
  kind?: "native" | "composio";
  logoUrl?: string;
  categories?: string[];
  toolsCount?: number;
}

export interface ComposioDirectoryTool {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
  categories: string[];
  toolsCount?: number;
  noAuth?: boolean;
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
}

export interface Repo {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface Space {
  id: string;
  name: string;
  channel: string;
  status: SpaceStatus;
  lastRun: string;
  runCount: number;
  tokenUsage: number;
  cost: number;
  tools: Tool[];
  repos: Repo[];
  recentActivity: string;
  modelId?: string;
  instructions?: string;
}

export interface Run {
  id: string;
  spaceId: string;
  spaceName: string;
  channel: string;
  status: RunStatus;
  startedAt: string;
  duration: string;
  toolCalls: number;
  triggeredBy: string;
}

export interface ActivityPoint {
  h: string;
  runs: number;
  failed: number;
}

export interface Approval {
  id: string;
  spaceId: string;
  spaceName: string;
  channel: string;
  action: string;
  description: string;
  requestedAt: string;
  requestedBy: string;
  context: string;
}

export interface RunEvent {
  id: string;
  type: RunEventType;
  time: string;
  label: string;
  detail: string;
  status?: "success" | "failed" | "pending";
}

export interface ControlPlanePayload {
  organizationId: string;
  slackWorkspace: {
    id: string;
    teamId: string;
    name?: string | null;
    botUserId?: string | null;
    scopes: string[];
  } | null;
  spaces: Space[];
  runs: Run[];
  activity24h: ActivityPoint[];
  approvals: Approval[];
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === "string" ? body.error : `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function loadControlPlane() {
  return requestJson<ControlPlanePayload>("/api/control-plane");
}

export function createSpace(input: { name: string; channel: string; channelId?: string }) {
  return requestJson<{ spaceId: string; configId: string }>("/api/spaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSpaceConfig(spaceId: string, input: { enabledTools?: string[]; enabledConnections?: string[]; repoUrls?: string[] }) {
  return requestJson<{ configId: string; version: number }>(`/api/spaces/${spaceId}/config`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function loadComposioDirectory() {
  return requestJson<{ items: ComposioDirectoryTool[]; source: "composio" | "fallback" }>("/api/composio/toolkits");
}

export function loadSlackChannels() {
  return requestJson<{ channels: SlackChannel[]; source: "slack" }>("/api/slack/channels");
}

export function authorizeComposioTool(spaceId: string, toolkitId: string) {
  return requestJson<{ connectUrl: string | null; configId: string; version: number }>(
    `/api/spaces/${spaceId}/tools/${encodeURIComponent(toolkitId)}/authorize`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function respondToApproval(approvalId: string, decision: "approved" | "rejected") {
  return requestJson<{ ok: true }>(`/api/approvals/${approvalId}/respond`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

export async function loadRunEvents(runId: string): Promise<RunEvent[]> {
  const payload = await requestJson<{
    events: Array<{ seq: number; eventType: string; payload: Record<string, unknown>; createdAt: string }>;
  }>(`/api/runs/${runId}/events`);
  return payload.events.map((event) => {
    const createdAt = new Date(event.createdAt);
    const status = event.payload.status === "failed" ? "failed" : event.payload.status === "pending" ? "pending" : "success";
    return {
      id: String(event.seq),
      type: eventType(event.eventType),
      time: createdAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      label: String(event.payload.label ?? event.eventType),
      detail: String(event.payload.detail ?? event.payload.message ?? JSON.stringify(event.payload)),
      status,
    };
  });
}

function eventType(value: string): RunEventType {
  if (value.includes("approval")) return "approval";
  if (value.includes("error")) return "error";
  if (value.includes("artifact")) return "artifact";
  if (value.includes("tool")) return "tool_call";
  if (value.includes("end") || value.includes("complete")) return "end";
  return "start";
}
