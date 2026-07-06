export type ToolAuthState = "connected" | "requires_auth" | "not_authenticated";
export type SpaceStatus = "active" | "paused" | "error";
export type RunStatus = "success" | "running" | "failed" | "pending";
export type RunTrigger = "mention" | "reply" | "schedule" | "approval_response";
export type RunEventType = "start" | "tool_call" | "approval" | "error" | "artifact" | "end";

export interface Tool {
  id: string;
  name: string;
  description: string;
  provider: string;
  enabled: boolean;
  authState: ToolAuthState;
  authStatus?: string | null;
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

export interface GitHubRepo {
  id: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  defaultBranch?: string | null;
}

export interface SpaceDailyUsage {
  date: string;
  runs: number;
  tokens: number;
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
  dailyUsage: SpaceDailyUsage[];
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
  trigger: RunTrigger;
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
  json?: string;
}

export interface Schedule {
  id: string;
  cron: string;
  timezone: string;
  prompt: string;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
}

export interface Artifact {
  id: string;
  kind: string;
  title: string;
  url: string;
  createdAt: string;
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
    const message =
      typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : `Request failed: ${response.status}`;
    throw new Error(message);
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

export function deleteSpace(spaceId: string) {
  return requestJson<{ ok: true }>(`/api/spaces/${spaceId}`, {
    method: "DELETE",
  });
}

export function updateSpaceConfig(
  spaceId: string,
  input: {
    enabledTools?: string[];
    availableConnections?: string[];
    enabledConnections?: string[];
    repoUrls?: string[];
  },
) {
  return requestJson<{ configId: string; version: number }>(`/api/spaces/${spaceId}/config`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function loadSpaceSchedules(spaceId: string) {
  return requestJson<{ schedules: Schedule[] }>(`/api/spaces/${spaceId}/schedules`);
}

export function createSpaceSchedule(spaceId: string, input: { prompt: string; cron: string; timezone: string }) {
  return requestJson<{ schedule: Schedule }>(`/api/spaces/${spaceId}/schedules`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loadSpaceArtifacts(spaceId: string) {
  return requestJson<{ artifacts: Artifact[] }>(`/api/spaces/${spaceId}/artifacts`);
}

export function loadComposioDirectory() {
  return requestJson<{ items: ComposioDirectoryTool[]; source: "composio" | "fallback" }>("/api/composio/toolkits");
}

export function loadSlackChannels() {
  return requestJson<{ channels: SlackChannel[]; source: "slack" }>("/api/slack/channels");
}

export function loadGitHubRepos(spaceId: string) {
  return requestJson<{ repos: GitHubRepo[]; source: "github" }>(`/api/spaces/${spaceId}/github/repos`);
}

export function authorizeComposioTool(spaceId: string, toolkitId: string) {
  return requestJson<{ connectUrl: string | null; connectionId: string | null; configId: string; version: number }>(
    `/api/spaces/${spaceId}/tools/${encodeURIComponent(toolkitId)}/authorize`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function loadComposioToolStatus(spaceId: string, toolkitId: string) {
  return requestJson<{ authState: ToolAuthState; authStatus: string | null }>(
    `/api/spaces/${spaceId}/tools/${encodeURIComponent(toolkitId)}/status`,
  );
}

export function respondToApproval(approvalId: string, decision: "approved" | "rejected") {
  return requestJson<{ ok: true }>(`/api/approvals/${approvalId}/respond`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

function eventType(value: string): RunEventType {
  if (value.includes("approval")) return "approval";
  if (value.includes("error") || value === "run.failed") return "error";
  if (value.includes("artifact")) return "artifact";
  if (value.includes("tool")) return "tool_call";
  if (value === "run.finished" || value.includes("end") || value.includes("complete")) return "end";
  return "start";
}

function prettyJson(value: unknown): string | undefined {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return undefined;
  try {
    let out = JSON.stringify(value, null, 2);
    if (out === "{}") return undefined;
    if (out.length > 5000) {
      out = out.slice(0, 5000) + "\n…(truncated)";
    }
    return out;
  } catch {
    return undefined;
  }
}

export async function loadRunEvents(runId: string): Promise<RunEvent[]> {
  const payload = await requestJson<{
    events: Array<{ seq: number; eventType: string; payload: Record<string, unknown>; createdAt: string }>;
  }>(`/api/runs/${runId}/events`);
  return payload.events
    .filter((event) => event.eventType !== "text.delta")
    .map((event) => {
      const createdAt = new Date(event.createdAt);
      const p = event.payload;
      const type = eventType(event.eventType);
      let label = String(p.label ?? event.eventType);
      let detail = String(p.detail ?? p.message ?? "");
      let json: string | undefined;
      let status: "success" | "failed" | "pending" = "success";

      if (event.eventType === "tool.started") {
        label = String(p.toolName ?? "tool");
        detail = "Tool call started";
        json = prettyJson(p.inputPreview);
        status = "pending";
      } else if (event.eventType === "tool.finished") {
        label = String(p.toolName ?? "tool");
        detail = "Tool call completed";
        json = prettyJson(p.outputPreview);
        status = "success";
      } else if (event.eventType === "approval.requested") {
        label = "Approval requested";
        detail = String(p.requestText ?? p.toolName ?? "");
        json = prettyJson(p.inputPreview);
        status = "pending";
      } else if (event.eventType === "question.requested") {
        label = "Question asked";
        detail = String(p.questionText ?? "");
        status = "pending";
      } else if (event.eventType === "artifact.created") {
        label = "Artifact created";
        detail = String(p.artifactTitle ?? "");
        status = "success";
      } else if (event.eventType === "run.finished") {
        label = "Run completed";
        status = "success";
      } else if (event.eventType === "run.failed") {
        label = "Run failed";
        detail = String(p.error ?? "");
        status = "failed";
      } else if (event.eventType === "recording.started") {
        label = "Recording started";
        status = "pending";
      } else if (event.eventType === "recording.finished") {
        label = "Recording finished";
        detail = String(p.prUrl ?? "");
        status = "success";
      } else if (event.eventType === "recording.failed") {
        label = "Recording failed";
        detail = String(p.error ?? "");
        status = "failed";
      } else if (event.eventType === "status") {
        label = String(p.label ?? "Status");
        detail = String(p.detail ?? "");
        status = "success";
      } else if (p.status === "failed") {
        status = "failed";
      } else if (p.status === "pending") {
        status = "pending";
      }

      return {
        id: String(event.seq),
        type,
        time: createdAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        label,
        detail,
        json,
        status,
      };
    });
}
