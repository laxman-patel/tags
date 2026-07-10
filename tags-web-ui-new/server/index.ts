import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClerkClient, type ClerkClient } from "@clerk/backend";
import { metrics, SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import { serve as serveInngest } from "inngest/node";
import {
  createSpaceConfigVersion,
  createSpaceWithConfig,
  deleteSpace,
  getSpaceById,
  listSpaces,
} from "@tags/core/spaces-admin";
import { loadActiveSpaceConfig, resolveSpaceByChannel } from "@tags/core/spaces";
import { recordAuditEvent } from "@tags/core/audit";
import {
  getAccountForClerkUser,
  resolveOrCreateClerkAccount,
  type TagsAccount,
} from "@tags/core/accounts";
import { canApprove } from "@tags/core/policies";
import { formatApprovalSummary } from "@tags/core/approval-display";
import { answerQuestionByRequestId, getQuestionByRequestId } from "@tags/core/questions";
import { createSchedule, isValidScheduleCron, listSchedules } from "@tags/core/schedules";
import { listArtifactsForSpace } from "@tags/core/artifacts";
import {
  OrganizationSlackWorkspaceConflictError,
  SlackWorkspaceAlreadyConnectedError,
  assertWorkspaceConnectable,
  decryptSlackBotToken,
  getSlackInstallationByTeamId,
  getSlackInstallationForOrg,
  upsertSlackInstallation,
} from "@tags/core/slack-installations";
import {
  alwaysEnabledNativeTools,
  isNativeToolId,
  NATIVE_TOOL_METADATA,
} from "@tags/core/tools";
import {
  NATIVE_APPROVABLE_TOOLS,
  listSpaceToolApprovals,
  parseToolApprovalKey,
  setSpaceToolApproval,
} from "@tags/core/tool-approvals";
import { spaceHasGitHubConnection } from "@tags/core/composio-toolkits";
import { TAGS_MODEL_ID } from "@tags/core/model-labels";
import { resolveOrCreateUser } from "@tags/core/users";
import { getSpaceDailyUsage, getSpaceUsageInWindow } from "@tags/core/usage";
import {
  appendRunEvent,
  expireApprovalByRequestId,
  listPendingApprovals,
  listRunEventsAfter,
  resolveApprovalByRequestId,
  resolveApprovalRequest,
} from "@tags/core/runs";
import {
  approvalRequests,
  asc,
  count,
  createDb,
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  messages,
  runEvents,
  runs,
  slackOauthStates,
  spaces,
  sql,
  users,
  type Db,
} from "@tags/db";
import {
  APPROVAL_RESOLVED_EVENT,
  QUESTION_ANSWERED_EVENT,
  RUN_REQUESTED_EVENT,
  buildRuntimeProviderConfig,
  handleTagsMcpRequest,
  handleComposioMcpRequest,
  inngest,
  loadRuntimeSecrets,
  passiveLearningTickFunction,
  scheduleTickFunction,
  tagsRunFunction,
  type TagsRunInput,
} from "@tags/runtime";
import {
  authorizeComposioToolkit,
  listComposioConnectedAccountStatuses,
  listComposioToolkitActions,
  listComposioToolkits,
  resolveToolkitConnectionStatus,
  type ComposioToolkitDirectoryItem,
} from "@tags/runtime/tools/composio";
import {
  listGitHubReposForEntity,
  parseGitHubRepoUrl,
  testGitHubRepoAccessForEntity,
} from "@tags/runtime/integrations/composio-github";
import {
  DEFAULT_SLACK_BOT_SCOPES,
  addReaction,
  buildApprovalResolutionCard,
  buildSlackAuthorizeUrl,
  createSlackClient,
  ensureSlackUserDisplayName,
  exchangeSlackOAuthCode,
  joinSlackChannel,
  listSlackChannels,
  postThreadMessage,
  resolveSlackUserDisplayNames,
  startStream,
  updateMessage,
  verifySlackSignature,
} from "@tags/slack";
import { createServer as createViteServer, type ViteDevServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(appRoot, "..");
const distRoot = path.join(appRoot, "dist");
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 3000);
const tracer = trace.getTracer("tags.control_plane");
const meter = metrics.getMeter("tags.control_plane");
const apiRequestsCompleted = meter.createCounter("control_plane.api.requests.completed");
const businessOperationsCompleted = meter.createCounter("control_plane.business.operations.completed");

let db: Db | null = null;
let clerkClient: ClerkClient | null = null;

const inngestHandler = serveInngest({
  client: inngest,
  functions: [tagsRunFunction, scheduleTickFunction, passiveLearningTickFunction],
});

function loadDotEnv() {
  for (const file of [path.join(workspaceRoot, ".env"), path.join(appRoot, ".env")]) {
    if (!existsSync(file)) continue;
    const body = readFileSync(file, "utf8");
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const rawValue = trimmed.slice(index + 1).trim();
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

loadDotEnv();
validateRuntimeEnv();

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validateRuntimeEnv() {
  const required = ["DATABASE_URL", "NEXT_PUBLIC_APP_URL"];
  if (isProduction) {
    required.push(
      "SLACK_CLIENT_ID",
      "SLACK_CLIENT_SECRET",
      "SLACK_SIGNING_SECRET",
      "TAGS_ENCRYPTION_KEY",
      "CLERK_SECRET_KEY",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    );
  }

  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const encryptionKey = process.env.TAGS_ENCRYPTION_KEY;
  if (encryptionKey) {
    const key = Buffer.from(encryptionKey, "base64");
    if (key.byteLength !== 32) {
      throw new Error("TAGS_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    }
  }
}

function getDb(): Db {
  if (!db) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    db = createDb(process.env.DATABASE_URL);
  }
  return db;
}

function getClerkClient(): ClerkClient {
  if (!clerkClient) {
    clerkClient = createClerkClient({
      secretKey: requireEnv("CLERK_SECRET_KEY"),
      publishableKey: requireEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    });
  }
  return clerkClient;
}

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

function sendJson(res: ServerResponse, status: number, body: JsonValue) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendRedirect(res: ServerResponse, location: string, status = 302) {
  res.writeHead(status, { location });
  res.end();
}

function sendHtml(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const body = await readRawBody(req);
  if (!body) return {};
  return JSON.parse(body);
}

async function writeWebResponse(res: ServerResponse, response: Response) {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

type AccountContext = TagsAccount & {
  clerkUserId: string;
};

type SlackEventPayload = {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: {
    type?: string;
    subtype?: string;
    bot_id?: string;
    user?: string;
    channel?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
  };
};

type SlackBlockActionPayload = {
  type: "block_actions";
  team?: { id?: string };
  user?: { id?: string; username?: string };
  trigger_id?: string;
  channel?: { id?: string };
  message?: { ts?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
};

type SlackViewSubmissionPayload = {
  type: "view_submission";
  team?: { id?: string };
  user?: { id?: string };
  view: {
    callback_id?: string;
    private_metadata?: string;
    state: {
      values: Record<string, Record<string, { value?: string }>>;
    };
  };
};

type SlackInteractionPayload = SlackBlockActionPayload | SlackViewSubmissionPayload;

function authorizedParties(): string[] {
  const parties = new Set<string>([
    getAppUrl(),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  try {
    parties.add(new URL(getAppUrl()).origin);
  } catch {
    // validateRuntimeEnv catches malformed production values.
  }
  return [...parties];
}

function incomingHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  return headers;
}

async function requireAccount(req: IncomingMessage, db: Db): Promise<AccountContext> {
  return await tracer.startActiveSpan("account.resolve", async (span) => {
    try {
      const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const request = new Request(requestUrl.href, {
        method: req.method ?? "GET",
        headers: incomingHeaders(req),
      });
      const state = await getClerkClient().authenticateRequest(request, {
        authorizedParties: authorizedParties(),
      });

      if (!state.isAuthenticated) {
        businessOperationsCompleted.add(1, { operation: "account.resolve", outcome: "unauthorized" });
        throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
      }

      const auth = state.toAuth();
      if (!auth || !auth.userId) {
        businessOperationsCompleted.add(1, { operation: "account.resolve", outcome: "unauthorized" });
        throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
      }

      const clerkUser = await getClerkClient().users.getUser(auth.userId);
      const account = await resolveOrCreateClerkAccount(db, {
        id: clerkUser.id,
        fullName: clerkUser.fullName,
        username: clerkUser.username,
        primaryEmailAddress: clerkUser.primaryEmailAddress,
      });

      span.setAttributes({
        "organization.id": account.organization.id,
        "user.id": account.user.id,
        outcome: "success",
      });
      businessOperationsCompleted.add(1, { operation: "account.resolve", outcome: "success" });
      return { ...account, clerkUserId: auth.userId };
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      if ((error as { statusCode?: number }).statusCode !== 401) {
        businessOperationsCompleted.add(1, { operation: "account.resolve", outcome: "failure" });
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "never";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(startedAt: Date, finishedAt: Date | null) {
  const end = finishedAt ?? new Date();
  const seconds = Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${String(rem).padStart(2, "0")}s`;
}

function runStatus(status: string) {
  if (status === "done") return "success";
  if (status === "failed") return "failed";
  if (status === "streaming" || status === "waiting") return "running";
  return "pending";
}

function hourLabel(date: Date) {
  return String(date.getHours()).padStart(2, "0");
}

function repoName(repoUrl: string) {
  return repoUrl
    .replace(/^git@github.com:/, "")
    .replace(/^https:\/\/github.com\//, "")
    .replace(/\.git$/, "");
}

const FALLBACK_COMPOSIO_DIRECTORY: ComposioToolkitDirectoryItem[] = [
  { id: "github", name: "GitHub", description: "Read and write repositories, issues, pull requests, and comments.", logoUrl: "https://cdn.simpleicons.org/github/FFFFFF", categories: ["Developer tools"], toolsCount: 42 },
  { id: "linear", name: "Linear", description: "Create, search, and update Linear issues and projects.", logoUrl: "https://cdn.simpleicons.org/linear/5E6AD2", categories: ["Project management"], toolsCount: 27 },
  { id: "slack", name: "Slack", description: "Read channels and send messages through Slack.", logoUrl: "https://cdn.simpleicons.org/slack", categories: ["Communication"], toolsCount: 18 },
  { id: "notion", name: "Notion", description: "Read and write Notion pages, databases, and comments.", logoUrl: "https://cdn.simpleicons.org/notion/FFFFFF", categories: ["Knowledge"], toolsCount: 31 },
  { id: "jira", name: "Jira", description: "Search, create, and update Jira issues.", logoUrl: "https://cdn.simpleicons.org/jira/2684FF", categories: ["Project management"], toolsCount: 28 },
  { id: "googlecalendar", name: "Google Calendar", description: "Read calendars and create events.", logoUrl: "https://cdn.simpleicons.org/googlecalendar", categories: ["Productivity"], toolsCount: 14 },
  { id: "gmail", name: "Gmail", description: "Search, draft, and send email with Gmail.", logoUrl: "https://cdn.simpleicons.org/gmail", categories: ["Communication"], toolsCount: 24 },
  { id: "googledrive", name: "Google Drive", description: "Find, read, and manage Drive files.", logoUrl: "https://cdn.simpleicons.org/googledrive", categories: ["Storage"], toolsCount: 22 },
  { id: "sentry", name: "Sentry", description: "Inspect issues, events, releases, and project health.", logoUrl: "https://cdn.simpleicons.org/sentry/362D59", categories: ["Observability"], toolsCount: 16 },
  { id: "pagerduty", name: "PagerDuty", description: "Create, acknowledge, and resolve incidents.", logoUrl: "https://cdn.simpleicons.org/pagerduty/06AC38", categories: ["Incident response"], toolsCount: 13 },
  { id: "datadog", name: "Datadog", description: "Query monitors, dashboards, logs, and metrics.", logoUrl: "https://cdn.simpleicons.org/datadog/632CA6", categories: ["Observability"], toolsCount: 20 },
  { id: "stripe", name: "Stripe", description: "Find customers, payments, subscriptions, and invoices.", logoUrl: "https://cdn.simpleicons.org/stripe/635BFF", categories: ["Payments"], toolsCount: 25 },
  { id: "hubspot", name: "HubSpot", description: "Read and update CRM contacts, companies, and deals.", logoUrl: "https://cdn.simpleicons.org/hubspot/FF7A59", categories: ["CRM"], toolsCount: 30 },
  { id: "zendesk", name: "Zendesk", description: "Search, create, and update support tickets.", logoUrl: "https://cdn.simpleicons.org/zendesk/FFFFFF", categories: ["Support"], toolsCount: 21 },
  { id: "intercom", name: "Intercom", description: "Read and manage conversations, users, and tickets.", logoUrl: "https://cdn.simpleicons.org/intercom/6AFDEF", categories: ["Support"], toolsCount: 18 },
  { id: "figma", name: "Figma", description: "Read files, comments, and design metadata.", logoUrl: "https://cdn.simpleicons.org/figma", categories: ["Design"], toolsCount: 10 },
  { id: "vercel", name: "Vercel", description: "Inspect deployments, projects, teams, and logs.", logoUrl: "https://cdn.simpleicons.org/vercel/FFFFFF", categories: ["Developer tools"], toolsCount: 15 },
  { id: "salesforce", name: "Salesforce", description: "Query CRM accounts, leads, opportunities, and cases.", logoUrl: "https://cdn.simpleicons.org/salesforce/00A1E0", categories: ["CRM"], toolsCount: 26 },
  { id: "airtable", name: "Airtable", description: "Read and update bases, tables, and records.", logoUrl: "https://cdn.simpleicons.org/airtable", categories: ["Data"], toolsCount: 19 },
  { id: "asana", name: "Asana", description: "Create and update tasks, projects, and comments.", logoUrl: "https://cdn.simpleicons.org/asana/F06A6A", categories: ["Project management"], toolsCount: 17 },
  { id: "clickup", name: "ClickUp", description: "Manage tasks, lists, docs, and comments.", logoUrl: "https://cdn.simpleicons.org/clickup/7B68EE", categories: ["Project management"], toolsCount: 18 },
  { id: "trello", name: "Trello", description: "Read and update boards, cards, lists, and members.", logoUrl: "https://cdn.simpleicons.org/trello/0052CC", categories: ["Project management"], toolsCount: 16 },
  { id: "microsoftteams", name: "Microsoft Teams", description: "Read and send Teams messages.", logoUrl: "https://cdn.simpleicons.org/microsoftteams/6264A7", categories: ["Communication"], toolsCount: 12 },
  { id: "dropbox", name: "Dropbox", description: "Find, read, and manage Dropbox files.", logoUrl: "https://cdn.simpleicons.org/dropbox/0061FF", categories: ["Storage"], toolsCount: 12 },
];

function toolkitName(toolkitId: string) {
  return toolkitId
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function fallbackToolkitMetadata(toolkitId: string) {
  const fallback = FALLBACK_COMPOSIO_DIRECTORY.find((toolkit) => toolkit.id === toolkitId);
  return {
    name: fallback?.name ?? toolkitName(toolkitId),
    description: fallback?.description ?? `Connect ${toolkitName(toolkitId)} through Composio.`,
    provider: "Composio",
    logoUrl: fallback?.logoUrl,
    toolsCount: fallback?.toolsCount,
    categories: fallback?.categories ?? [],
  };
}

async function loadComposioDirectory() {
  const apiKey = process.env.COMPOSIO_API_KEY ?? "";
  if (!apiKey) return { items: FALLBACK_COMPOSIO_DIRECTORY, source: "fallback" as const };

  try {
    const items = await listComposioToolkits({ apiKey });
    return {
      items: items.length > 0 ? items : FALLBACK_COMPOSIO_DIRECTORY,
      source: items.length > 0 ? ("composio" as const) : ("fallback" as const),
    };
  } catch (error) {
    console.warn("[control-plane] failed to load Composio toolkits", error);
    return { items: FALLBACK_COMPOSIO_DIRECTORY, source: "fallback" as const };
  }
}

async function getAccountSlackClient(db: Db, organizationId: string) {
  const installation = await getSlackInstallationForOrg(db, organizationId);
  if (!installation) return null;
  const token = decryptSlackBotToken(installation, requireEnv("TAGS_ENCRYPTION_KEY"));
  return { installation, client: createSlackClient(token), token };
}

async function loadSlackChannelsForAccount(db: Db, organizationId: string) {
  return await tracer.startActiveSpan("slack.channels.list", async (span) => {
    try {
      span.setAttribute("organization.id", organizationId);
      const slack = await getAccountSlackClient(db, organizationId);
      if (!slack) {
        businessOperationsCompleted.add(1, { operation: "slack.channels.list", outcome: "not_connected" });
        return { channels: [], source: "slack" as const };
      }
      const channels = await listSlackChannels(slack.client);
      businessOperationsCompleted.add(1, { operation: "slack.channels.list", outcome: "success" });
      span.setAttributes({ outcome: "success", "slack.channels.count": channels.length });
      return { channels, source: "slack" as const };
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      businessOperationsCompleted.add(1, { operation: "slack.channels.list", outcome: "failure" });
      throw error;
    } finally {
      span.end();
    }
  });
}

function legacyComposioConnections(enabledTools: string[] | undefined) {
  return (enabledTools ?? []).filter((toolId) => !isNativeToolId(toolId));
}

function mergeConnections(...groups: Array<string[] | undefined>) {
  return Array.from(new Set(groups.flatMap((group) => group ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

function composioAuthState(args: { hasApiKey: boolean; enabled: boolean; accountStatus?: string | null }) {
  const status = resolveToolkitConnectionStatus(args);
  if (status === "connected") return "connected";
  if (status === "needs_auth" || status === "missing_api_key") return "requires_auth";
  return "not_authenticated";
}

async function loadGitHubConnectionContext(db: Db, spaceId: string) {
  const config = await loadActiveSpaceConfig(db, spaceId);
  const availableConnections = mergeConnections(
    config?.availableConnections,
    legacyComposioConnections(config?.enabledTools),
  );
  const apiKey = process.env.COMPOSIO_API_KEY ?? "";
  const accountStatuses =
    availableConnections.length > 0
      ? await listComposioConnectedAccountStatuses({
          apiKey,
          entityId: spaceId,
        }).catch(() => ({} as Record<string, string>))
      : {};
  return { config, availableConnections, accountStatuses, apiKey };
}

async function loadGitHubReposForSpace(db: Db, spaceId: string) {
  const context = await loadGitHubConnectionContext(db, spaceId);
  if (
    !spaceHasGitHubConnection({
      availableConnections: context.availableConnections,
      accountStatuses: context.accountStatuses,
    })
  ) {
    return { ok: false as const, error: "github_not_connected" as const };
  }
  if (!context.apiKey) {
    return { ok: false as const, error: "composio_not_configured" as const };
  }

  const result = await listGitHubReposForEntity({
    apiKey: context.apiKey,
    entityId: spaceId,
  });
  if (!result.ok) {
    return {
      ok: false as const,
      error: "github_list_failed" as const,
      message: result.message,
    };
  }
  return { ok: true as const, repos: result.repos };
}

async function validateRepoUrlsForSpace(db: Db, spaceId: string, repoUrls: string[]) {
  const context = await loadGitHubConnectionContext(db, spaceId);
  if (
    !spaceHasGitHubConnection({
      availableConnections: context.availableConnections,
      accountStatuses: context.accountStatuses,
    })
  ) {
    return { ok: false as const, error: "github_not_connected" as const };
  }
  if (!context.apiKey) {
    return { ok: false as const, error: "composio_not_configured" as const };
  }

  for (const url of repoUrls) {
    const ref = parseGitHubRepoUrl(url);
    if (!ref) {
      return { ok: false as const, error: "invalid_repo_url" as const, url };
    }
    const access = await testGitHubRepoAccessForEntity({
      apiKey: context.apiKey,
      entityId: spaceId,
      owner: ref.owner,
      repo: ref.repo,
    });
    if (!access.ok) {
      return {
        ok: false as const,
        error: "repo_inaccessible" as const,
        url,
        message: access.message,
      };
    }
  }
  return { ok: true as const };
}

async function buildSpacesPayload(db: Db, organizationId: string) {
  const rows = await listSpaces(db, organizationId);
  return Promise.all(
    rows.map(async (row) => {
      const config = await loadActiveSpaceConfig(db, row.space.id);
      const usage = await getSpaceUsageInWindow(db, row.space.id, 30);
      const dailyUsage = await getSpaceDailyUsage(db, {
        organizationId,
        spaceId: row.space.id,
        days: 7,
      });
      const runCount = usage.runCount;
      const totalTokens = usage.totalTokens;
      const costMicroUsd = usage.costMicroUsd;
      const repos = (config?.repoUrls ?? []).map((url, index) => ({
        id: url,
        name: repoName(url),
        isDefault: index === 0,
      }));
      const enabledConnections = mergeConnections(
        config?.enabledConnections,
        legacyComposioConnections(config?.enabledTools),
      );
      const availableConnections = mergeConnections(config?.availableConnections, enabledConnections);
      const enabledConnectionSet = new Set(enabledConnections);
      const accountStatuses =
        availableConnections.length > 0
          ? await listComposioConnectedAccountStatuses({
              apiKey: process.env.COMPOSIO_API_KEY ?? "",
              entityId: row.space.id,
            }).catch(() => ({} as Record<string, string>))
          : {};
      return {
        id: row.space.id,
        name: row.space.name,
        channel: row.space.slug || row.space.externalSpaceId,
        status: "active",
        lastRun: formatDate(row.space.updatedAt),
        runCount,
        tokenUsage: totalTokens,
        cost: costMicroUsd / 1_000_000,
        dailyUsage,
        recentActivity: runCount > 0 ? `${runCount} recorded runs` : "No runs yet",
        tools: [
          ...alwaysEnabledNativeTools().map((toolId) => ({
            ...NATIVE_TOOL_METADATA[toolId],
            kind: "native",
            enabled: true,
            authState: "connected",
          })),
          ...availableConnections.map((toolkitId) => {
            const enabled = enabledConnectionSet.has(toolkitId);
            const accountStatus = accountStatuses[toolkitId.trim().toLowerCase()];
            return {
              id: toolkitId,
              kind: "composio",
              enabled,
              authState: composioAuthState({
                hasApiKey: Boolean(process.env.COMPOSIO_API_KEY),
                enabled: true,
                accountStatus,
              }),
              authStatus: accountStatus ?? null,
              ...fallbackToolkitMetadata(toolkitId),
            };
          }),
        ],
        repos,
        modelId: TAGS_MODEL_ID,
        instructions: config?.instructions,
        autoApproveReadOnlyComposio: config?.autoApproveReadOnlyComposio ?? false,
        workspaceName: row.workspace.name,
        workspaceTeamId: row.workspace.externalWorkspaceId,
      };
    }),
  );
}

type SlackClient = ReturnType<typeof createSlackClient>;

async function buildRunsPayload(db: Db, organizationId: string, slackClient?: SlackClient) {
  let client = slackClient;
  if (!client) {
    try {
      const slack = await getAccountSlackClient(db, organizationId);
      client = slack?.client;
    } catch {
      // Best-effort; triggered-by falls back to Slack user IDs without a client.
    }
  }

  const rows = await db
    .select({
      run: runs,
      spaceName: spaces.name,
      spaceSlug: spaces.slug,
      externalSpaceId: spaces.externalSpaceId,
      msgAuthorType: messages.authorType,
      msgAuthorId: messages.authorId,
      userDisplayName: users.displayName,
    })
    .from(runs)
    .innerJoin(spaces, eq(runs.spaceId, spaces.id))
    .leftJoin(messages, eq(runs.inputMessageId, messages.id))
    .leftJoin(
      users,
      and(
        eq(messages.authorId, users.externalUserId),
        eq(users.externalProvider, "slack"),
        eq(users.organizationId, organizationId),
      ),
    )
    .where(eq(runs.organizationId, organizationId))
    .orderBy(desc(runs.startedAt))
    .limit(100);

  const runIds = rows.map((row) => row.run.id);
  const counts =
    runIds.length > 0
      ? await db
          .select({ runId: runEvents.runId, count: count() })
          .from(runEvents)
          .where(and(inArray(runEvents.runId, runIds), eq(runEvents.eventType, "tool.started")))
          .groupBy(runEvents.runId)
      : [];
  const countByRun = new Map(counts.map((entry) => [entry.runId, Number(entry.count)]));

  const unresolvedSlackUserIds = new Set<string>();

  // For runs without inputMessageId (legacy), find the trigger message via thread.
  const runsNeedingFallback = rows.filter((row) => !row.msgAuthorType && row.run.trigger !== "schedule");
  if (runsNeedingFallback.length > 0) {
    const threadIds = [...new Set(runsNeedingFallback.map((row) => row.run.threadId))];
    const fallbackMsgs = await db
      .select({
        threadId: messages.threadId,
        authorId: messages.authorId,
        createdAt: messages.createdAt,
        displayName: users.displayName,
      })
      .from(messages)
      .leftJoin(
        users,
        and(
          eq(messages.authorId, users.externalUserId),
          eq(users.externalProvider, "slack"),
          eq(users.organizationId, organizationId),
        ),
      )
      .where(and(inArray(messages.threadId, threadIds), eq(messages.authorType, "human")))
      .orderBy(asc(messages.createdAt));

    const msgsByThread = new Map<string, typeof fallbackMsgs>();
    for (const m of fallbackMsgs) {
      const arr = msgsByThread.get(m.threadId) ?? [];
      arr.push(m);
      msgsByThread.set(m.threadId, arr);
    }

    for (const row of runsNeedingFallback) {
      const threadMsgs = msgsByThread.get(row.run.threadId);
      if (!threadMsgs || threadMsgs.length === 0) continue;
      const runStart = row.run.startedAt.getTime();
      let best = threadMsgs[0]!;
      let bestDiff = Math.abs(best.createdAt.getTime() - runStart);
      for (const m of threadMsgs) {
        const diff = Math.abs(m.createdAt.getTime() - runStart);
        if (diff < bestDiff) {
          best = m;
          bestDiff = diff;
        }
      }
      row.msgAuthorType = "human";
      row.msgAuthorId = best.authorId;
      row.userDisplayName = best.displayName;
      if (best.authorId && best.authorId !== "unknown" && !best.displayName) {
        unresolvedSlackUserIds.add(best.authorId);
      }
    }
  }

  // Also resolve names for runs that had inputMessageId but no cached display name.
  for (const row of rows) {
    if (row.msgAuthorType === "human" && row.msgAuthorId && row.msgAuthorId !== "unknown" && !row.userDisplayName) {
      unresolvedSlackUserIds.add(row.msgAuthorId);
    }
  }
  const resolvedNames = await resolveSlackUserDisplayNames(client, db, organizationId, unresolvedSlackUserIds);

  return rows.map((row) => {
    const triggeredBy = formatTriggeredBy(
      row.run.trigger,
      row.msgAuthorType,
      row.msgAuthorId,
      row.userDisplayName,
      resolvedNames,
    );
    return {
      id: row.run.id,
      spaceId: row.run.spaceId,
      spaceName: row.spaceName,
      channel: row.spaceSlug || row.externalSpaceId,
      status: runStatus(row.run.status),
      startedAt: row.run.startedAt.toISOString(),
      duration: duration(row.run.startedAt, row.run.finishedAt),
      toolCalls: countByRun.get(row.run.id) ?? 0,
      trigger: row.run.trigger,
      triggeredBy,
    };
  });
}

function formatTriggeredBy(
  trigger: string,
  authorType: string | null,
  authorId: string | null,
  displayName: string | null,
  resolvedNames: Map<string, string>,
): string {
  if (trigger === "schedule") return "scheduled";
  if (authorType === "human" && authorId && authorId !== "unknown") {
    const name = displayName ?? resolvedNames.get(authorId);
    if (name) return name.startsWith("@") ? name : `@${name}`;
    return `@${authorId}`;
  }
  return trigger === "approval_response" ? "approval response" : trigger;
}

async function buildActivityPayload(db: Db, organizationId: string) {
  const currentHour = new Date();
  currentHour.setMinutes(0, 0, 0);

  const startHour = new Date(currentHour);
  startHour.setHours(currentHour.getHours() - 23);

  const buckets = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(startHour);
    date.setHours(startHour.getHours() + index);
    const key = date.toISOString();
    return { key, h: hourLabel(date), runs: 0, failed: 0 };
  });
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  const rows = await db
    .select({
      startedAt: runs.startedAt,
      status: runs.status,
    })
    .from(runs)
    .where(and(eq(runs.organizationId, organizationId), gte(runs.startedAt, startHour)));

  for (const row of rows) {
    const bucketDate = new Date(row.startedAt);
    bucketDate.setMinutes(0, 0, 0);
    const bucket = bucketByKey.get(bucketDate.toISOString());
    if (!bucket) continue;
    bucket.runs += 1;
    if (row.status === "failed") bucket.failed += 1;
  }

  return buckets.map(({ h, runs: runCount, failed }) => ({
    h,
    runs: runCount,
    failed,
  }));
}

async function buildApprovalsPayload(db: Db, organizationId: string) {
  const rows = await listPendingApprovals(db, organizationId);
  if (rows.length === 0) return [];
  const spaceRows = await db.select().from(spaces).where(inArray(spaces.id, rows.map((row) => row.spaceId)));
  const spaceById = new Map(spaceRows.map((space) => [space.id, space]));
  return rows.map((approval) => {
    const space = spaceById.get(approval.spaceId);
    return {
      id: approval.id,
      spaceId: approval.spaceId,
      spaceName: space?.name ?? "Unknown space",
      summary: formatApprovalSummary(approval.toolName, approval.toolInput),
      toolName: approval.toolName,
      riskLevel: approval.riskLevel,
      expiresAt: approval.expiresAt.toISOString(),
      requestedAt: formatDate(approval.createdAt),
    };
  });
}

async function loadControlPlane(db: Db, organizationId: string) {
  if (!organizationId) {
    return { organizationId: "", spaces: [], runs: [], activity24h: [], approvals: [], slackWorkspace: null };
  }
  let slackClient: SlackClient | undefined;
  let slackInstallation = null;
  try {
    const slack = await getAccountSlackClient(db, organizationId);
    if (slack) {
      slackClient = slack.client;
      slackInstallation = slack.installation;
    }
  } catch {
    slackInstallation = await getSlackInstallationForOrg(db, organizationId).catch(() => null);
  }
  const [spaceItems, runItems, activity24h, approvalItems] = await Promise.all([
    buildSpacesPayload(db, organizationId),
    buildRunsPayload(db, organizationId, slackClient),
    buildActivityPayload(db, organizationId),
    buildApprovalsPayload(db, organizationId),
  ]);
  return {
    organizationId,
    spaces: spaceItems,
    runs: runItems,
    activity24h,
    approvals: approvalItems,
    slackWorkspace: slackInstallation
      ? {
          id: slackInstallation.id,
          teamId: slackInstallation.externalWorkspaceId,
          name: slackInstallation.name,
          botUserId: slackInstallation.botUserId,
          scopes: slackInstallation.botScopes,
        }
      : null,
  };
}

async function updateSpaceConfig(
  db: Db,
  spaceId: string,
  patch: {
    enabledTools?: string[];
    availableConnections?: string[];
    enabledConnections?: string[];
    repoUrls?: string[];
    autoApproveReadOnlyComposio?: boolean;
  },
) {
  const space = await getSpaceById(db, spaceId);
  if (!space) return null;
  const current = await loadActiveSpaceConfig(db, spaceId);
  const result = await createSpaceConfigVersion(db, {
    spaceId,
    organizationId: space.organizationId,
    reasoning: current?.reasoning,
    instructions: current?.instructions ?? "You are Tags, an AI teammate for this Slack channel.",
    enabledSkills: current?.enabledSkills ?? [],
    enabledTools: alwaysEnabledNativeTools(),
    availableConnections:
      patch.availableConnections ??
      mergeConnections(current?.availableConnections, patch.enabledConnections, legacyComposioConnections(current?.enabledTools)),
    enabledConnections:
      patch.enabledConnections ??
      (patch.enabledTools ? legacyComposioConnections(patch.enabledTools) : undefined) ??
      mergeConnections(current?.enabledConnections, legacyComposioConnections(current?.enabledTools)),
    maxSteps: current?.maxSteps,
    runtimeMode: "opencode",
    repoUrls: patch.repoUrls ?? current?.repoUrls ?? [],
    passiveLearningMode: current?.passiveLearningMode,
    autoApproveReadOnlyComposio: patch.autoApproveReadOnlyComposio ?? current?.autoApproveReadOnlyComposio,
  });

  await recordAuditEvent(db, {
    organizationId: space.organizationId,
    spaceId,
    actorType: "human",
    eventType: "config.activated",
    payload: { version: result.version, source: "control_plane" },
  });
  return result;
}

function dashboardRedirect(params: Record<string, string>) {
  const url = new URL(getAppUrl());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function composioCallbackUrl(spaceId: string, toolkit: string) {
  const url = new URL(`${getAppUrl()}/api/composio/oauth/callback`);
  url.searchParams.set("space_id", spaceId);
  url.searchParams.set("toolkit", toolkit);
  return url.toString();
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function composioOauthCallbackHtml(url: URL) {
  const status = url.searchParams.get("status") ?? "success";
  const toolkit = url.searchParams.get("toolkit") ?? "tool";
  const ok = status.toLowerCase() !== "failed";
  const title = ok ? "Tool connected" : "Tool connection failed";
  const message = ok
    ? `${toolkitName(toolkit)} is connected. You can return to Tags.`
    : `Composio could not finish connecting ${toolkitName(toolkit)}. Return to Tags and try again.`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(title)}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0f19; color: #f8fafc; }
    main { width: min(360px, calc(100vw - 32px)); text-align: center; }
    .mark { width: 40px; height: 40px; margin: 0 auto 16px; border-radius: 10px; display: grid; place-items: center; background: ${ok ? "#16a34a" : "#dc2626"}; color: white; font-weight: 700; }
    h1 { margin: 0 0 8px; font-size: 20px; line-height: 1.2; }
    p { margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <div class="mark">${ok ? "✓" : "!"}</div>
    <h1>${htmlEscape(title)}</h1>
    <p>${htmlEscape(message)}</p>
  </main>
  <script>
    window.setTimeout(() => window.close(), 900);
  </script>
</body>
</html>`;
}

async function createSlackOauthState(db: Db, account: AccountContext): Promise<{
  state: string;
  redirectUri: string;
}> {
  return await tracer.startActiveSpan("slack.oauth.start", async (span) => {
    try {
      const state = randomBytes(32).toString("base64url");
      const redirectUri = `${getAppUrl()}/api/slack/oauth/callback`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db.insert(slackOauthStates).values({
        state,
        clerkUserId: account.clerkUserId,
        organizationId: account.organization.id,
        redirectUri,
        expiresAt,
      });
      span.setAttributes({
        "organization.id": account.organization.id,
        outcome: "success",
      });
      businessOperationsCompleted.add(1, { operation: "slack.oauth.start", outcome: "success" });
      return { state, redirectUri };
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      businessOperationsCompleted.add(1, { operation: "slack.oauth.start", outcome: "failure" });
      throw error;
    } finally {
      span.end();
    }
  });
}

async function consumeSlackOauthState(db: Db, state: string) {
  const [row] = await db
    .update(slackOauthStates)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(slackOauthStates.state, state),
        isNull(slackOauthStates.consumedAt),
        sql`${slackOauthStates.expiresAt} > now()`,
      ),
    )
    .returning();
  return row ?? null;
}

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  const code = (error as { code?: string; constraint?: string }).code;
  const actualConstraint = (error as { constraint?: string }).constraint;
  return code === "23505" && (!constraint || actualConstraint === constraint);
}

async function requireSpaceInOrg(db: Db, spaceId: string, organizationId: string) {
  const space = await getSpaceById(db, spaceId);
  if (!space || space.organizationId !== organizationId) return null;
  return space;
}

function verifySlackRequest(req: IncomingMessage, rawBody: string): boolean {
  const timestamp = String(req.headers["x-slack-request-timestamp"] ?? "");
  const signature = String(req.headers["x-slack-signature"] ?? "");
  return verifySlackSignature(requireEnv("SLACK_SIGNING_SECRET"), rawBody, timestamp, signature);
}

function slackErrorRedirect(error: unknown) {
  const code =
    error instanceof SlackWorkspaceAlreadyConnectedError
      ? "workspace_already_connected"
      : error instanceof OrganizationSlackWorkspaceConflictError
        ? "account_already_connected"
        : error instanceof Error
          ? error.message
          : "slack_oauth_failed";
  return dashboardRedirect({ slack_error: code });
}

async function persistApprovalSlackRef(
  db: Db,
  approvalId: string,
  channelId: string,
  messageTs: string,
) {
  await db
    .update(approvalRequests)
    .set({ slackChannelId: channelId, slackMessageTs: messageTs })
    .where(and(eq(approvalRequests.id, approvalId), isNull(approvalRequests.slackMessageTs)));
}

async function notifyApprovalResolvedOnSlack(args: {
  db: Db;
  organizationId: string;
  resolved: typeof approvalRequests.$inferSelect;
  decision: "approved" | "rejected";
  actorSlackUserId?: string;
  source: "slack_interaction" | "control_plane";
}) {
  const card = buildApprovalResolutionCard({
    decision: args.decision,
    toolName: args.resolved.toolName,
    toolInput: args.resolved.toolInput,
    actorSlackUserId: args.actorSlackUserId,
    source: args.source === "control_plane" ? "dashboard" : "slack",
  });

  if (args.source === "control_plane") {
    const slackBundle = await getAccountSlackClient(args.db, args.organizationId).catch(() => null);
    if (!slackBundle || !args.resolved.slackChannelId || !args.resolved.slackMessageTs) return;
    await updateMessage(
      slackBundle.client,
      args.resolved.slackChannelId,
      args.resolved.slackMessageTs,
      card.text,
      card.blocks,
    );
  }

  return card;
}

async function emitApprovalResolved(args: {
  db: Db;
  organizationId: string;
  spaceId: string;
  actorUserId: string;
  approvalId: string;
  runId: string;
  requestId: string;
  decision: "approved" | "rejected";
  source: "slack_interaction" | "control_plane";
}) {
  void recordAuditEvent(args.db, {
    organizationId: args.organizationId,
    spaceId: args.spaceId,
    actorUserId: args.actorUserId,
    actorType: "human",
    eventType: "approval.resolved",
    payload: { approvalId: args.approvalId, decision: args.decision, source: args.source },
  }).catch(() => {});
  await inngest.send({
    name: APPROVAL_RESOLVED_EVENT,
    data: { requestId: args.requestId, decision: args.decision },
  });
  void appendRunEvent(args.db, args.runId, {
    type: "approval.resolved",
    approvalId: args.approvalId,
    requestId: args.requestId,
    decision: args.decision,
    source: args.source,
  }).catch(() => {});
}

function questionAnsweredBlocks(args: { actorSlackUserId: string }) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Answered by <@${args.actorSlackUserId}>.`,
      },
    },
  ];
}

function getFirstModalAnswer(payload: SlackViewSubmissionPayload): string {
  const values = payload.view.state.values;
  for (const block of Object.values(values)) {
    for (const action of Object.values(block)) {
      if (typeof action.value === "string") return action.value.trim();
    }
  }
  return "";
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const method = req.method ?? "GET";
  const segments = url.pathname.split("/").filter(Boolean).slice(1);

  if (segments[0] === "inngest") {
    if (!["GET", "POST", "PUT"].includes(method)) {
      return sendJson(res, 405, { error: "Method not allowed" });
    }
    return inngestHandler(req, res);
  }

  if (segments[0] === "mcp" && segments[1] === "tags") {
    return handleMcpApi(req, res, url);
  }

  if (segments[0] === "mcp" && segments[1] === "composio") {
    return handleComposioMcpApi(req, res, url);
  }

  if (segments[0] === "slack" && segments[1] === "oauth" && segments[2] === "callback") {
    return handleSlackOauthCallback(req, res, url);
  }

  if (segments[0] === "composio" && segments[1] === "oauth" && segments[2] === "callback") {
    return sendHtml(res, 200, composioOauthCallbackHtml(url));
  }

  if (segments[0] === "slack" && segments[1] === "events") {
    return handleSlackEvents(req, res);
  }

  if (segments[0] === "slack" && segments[1] === "interactions") {
    return handleSlackInteractions(req, res);
  }

  const db = getDb();
  let account: AccountContext;
  try {
    account = await requireAccount(req, db);
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 401;
    return sendJson(res, status, { error: "Unauthorized" });
  }

  return handleProtectedApi(req, res, url, account);
}

async function handleProtectedApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  account: AccountContext,
) {
  const method = req.method ?? "GET";
  const segments = url.pathname.split("/").filter(Boolean).slice(1);

  return await tracer.startActiveSpan(`control_plane.${method.toLowerCase()}`, async (span) => {
    const started = performance.now();
    try {
      const db = getDb();
      const organizationId = account.organization.id;
      span.setAttributes({
        "http.method": method,
        "http.route": url.pathname,
        "organization.id": organizationId,
      });

      if (method === "GET" && segments[0] === "control-plane") {
        const payload = await loadControlPlane(db, organizationId);
        apiRequestsCompleted.add(1, { route: "control-plane", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "spaces.count": payload.spaces.length, "runs.count": payload.runs.length });
        return sendJson(res, 200, payload);
      }

      if (method === "GET" && segments[0] === "slack" && segments[1] === "oauth" && segments[2] === "start") {
        const oauthState = await createSlackOauthState(db, account);
        const existing = await getSlackInstallationForOrg(db, organizationId);
        const authorizeUrl = buildSlackAuthorizeUrl({
          clientId: requireEnv("SLACK_CLIENT_ID"),
          redirectUri: oauthState.redirectUri,
          state: oauthState.state,
          scopes: [...DEFAULT_SLACK_BOT_SCOPES],
          teamId: existing?.externalWorkspaceId,
        });
        return sendRedirect(res, authorizeUrl);
      }

      if (method === "GET" && segments[0] === "composio" && segments[1] === "toolkits") {
        const payload = await loadComposioDirectory();
        apiRequestsCompleted.add(1, { route: "composio.toolkits", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "toolkits.count": payload.items.length, "toolkits.source": payload.source });
        return sendJson(res, 200, payload);
      }

      if (method === "GET" && segments[0] === "slack" && segments[1] === "channels") {
        const payload = await loadSlackChannelsForAccount(db, organizationId);
        apiRequestsCompleted.add(1, { route: "slack.channels", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "slack.channels.count": payload.channels.length, "slack.channels.source": payload.source });
        return sendJson(res, 200, payload);
      }

      if (method === "POST" && segments[0] === "spaces" && segments.length === 1) {
        return createSpaceForAccount(req, res, db, account, span);
      }

      if (method === "DELETE" && segments[0] === "spaces" && segments.length === 2) {
        const spaceId = segments[1];
        if (!spaceId) return sendJson(res, 400, { error: "space id is required" });
        const result = await deleteSpace(db, { spaceId, organizationId });
        if (!result) return sendJson(res, 404, { error: "Not found" });
        await recordAuditEvent(db, {
          organizationId,
          actorUserId: account.user.id,
          actorType: "human",
          eventType: "space.deleted",
          payload: { spaceId, source: "control_plane" },
        });
        apiRequestsCompleted.add(1, { route: "spaces.delete", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "space.id": spaceId });
        return sendJson(res, 200, { ok: true });
      }

      if (method === "GET" && segments[0] === "spaces" && segments[2] === "schedules") {
        const spaceId = segments[1];
        if (!spaceId) return sendJson(res, 400, { error: "space id is required" });
        const space = await requireSpaceInOrg(db, spaceId, organizationId);
        if (!space) return sendJson(res, 404, { error: "Not found" });
        const schedules = await listSchedules(db, spaceId);
        apiRequestsCompleted.add(1, { route: "spaces.schedules", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "space.id": spaceId, "schedules.count": schedules.length });
        return sendJson(res, 200, {
          schedules: schedules.map((schedule) => ({
            id: schedule.id,
            cron: schedule.cron,
            timezone: schedule.timezone,
            prompt: schedule.prompt,
            enabled: schedule.enabled,
            lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
            createdAt: schedule.createdAt.toISOString(),
          })),
        });
      }

      if (method === "POST" && segments[0] === "spaces" && segments[2] === "schedules") {
        const spaceId = segments[1];
        if (!spaceId) return sendJson(res, 400, { error: "space id is required" });
        const space = await requireSpaceInOrg(db, spaceId, organizationId);
        if (!space) return sendJson(res, 404, { error: "Not found" });
        const body = (await readJson(req)) as { prompt?: string; cron?: string; timezone?: string };
        const prompt = body.prompt?.trim();
        const cron = body.cron?.trim();
        const timezone = body.timezone?.trim() || "UTC";
        if (!prompt || !cron) return sendJson(res, 400, { error: "prompt and cron are required" });
        if (!isValidScheduleCron(cron, timezone)) return sendJson(res, 400, { error: "cron or timezone is invalid" });
        const schedule = await createSchedule(db, {
          organizationId,
          spaceId,
          prompt,
          cron,
          timezone,
          createdByUserId: account.user.id,
        });
        await recordAuditEvent(db, {
          organizationId,
          spaceId,
          actorUserId: account.user.id,
          actorType: "human",
          eventType: "schedule.created",
          payload: { scheduleId: schedule?.id, source: "control_plane" },
        });
        apiRequestsCompleted.add(1, { route: "spaces.schedules", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "space.id": spaceId, "schedule.id": schedule?.id });
        return sendJson(res, 201, {
          schedule: schedule
            ? {
                id: schedule.id,
                cron: schedule.cron,
                timezone: schedule.timezone,
                prompt: schedule.prompt,
                enabled: schedule.enabled,
                lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
                createdAt: schedule.createdAt.toISOString(),
              }
            : null,
        });
      }

      if (method === "GET" && segments[0] === "spaces" && segments[2] === "artifacts") {
        const spaceId = segments[1];
        if (!spaceId) return sendJson(res, 400, { error: "space id is required" });
        const space = await requireSpaceInOrg(db, spaceId, organizationId);
        if (!space) return sendJson(res, 404, { error: "Not found" });
        const artifacts = await listArtifactsForSpace(db, spaceId, { organizationId });
        apiRequestsCompleted.add(1, { route: "spaces.artifacts", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "space.id": spaceId, "artifacts.count": artifacts.length });
        return sendJson(res, 200, {
          artifacts: artifacts.map((artifact) => ({
            id: artifact.id,
            kind: artifact.kind,
            title: artifact.title,
            url: artifact.url,
            createdAt: artifact.createdAt.toISOString(),
          })),
        });
      }

      if (method === "GET" && segments[0] === "spaces" && segments[2] === "github" && segments[3] === "repos") {
        const spaceId = segments[1];
        if (!spaceId) return sendJson(res, 400, { error: "space id is required" });
        const space = await requireSpaceInOrg(db, spaceId, organizationId);
        if (!space) return sendJson(res, 404, { error: "Not found" });

        const result = await loadGitHubReposForSpace(db, spaceId);
        if (!result.ok) {
          if (result.error === "composio_not_configured") {
            apiRequestsCompleted.add(1, { route: "spaces.github.repos", method, outcome: "missing_config" });
            return sendJson(res, 503, { error: "COMPOSIO_API_KEY is required to list GitHub repositories" });
          }
          if (result.error === "github_list_failed") {
            apiRequestsCompleted.add(1, { route: "spaces.github.repos", method, outcome: "failure" });
            return sendJson(res, 502, { error: result.error, message: result.message });
          }
          apiRequestsCompleted.add(1, { route: "spaces.github.repos", method, outcome: "forbidden" });
          return sendJson(res, 403, { error: "github_not_connected" });
        }

        apiRequestsCompleted.add(1, { route: "spaces.github.repos", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "space.id": spaceId, "github.repos.count": result.repos.length });
        return sendJson(res, 200, { repos: result.repos, source: "github" });
      }

      if (method === "PATCH" && segments[0] === "spaces" && segments[2] === "config") {
        const spaceId = segments[1];
        if (!spaceId) return sendJson(res, 400, { error: "space id is required" });
        const space = await requireSpaceInOrg(db, spaceId, organizationId);
        if (!space) return sendJson(res, 404, { error: "Not found" });
        const body = (await readJson(req)) as {
          enabledTools?: unknown;
          availableConnections?: unknown;
          enabledConnections?: unknown;
          repoUrls?: unknown;
          autoApproveReadOnlyComposio?: unknown;
        };
        if (body.repoUrls !== undefined) {
          const repoUrls = asStringArray(body.repoUrls);
          const validation = await validateRepoUrlsForSpace(db, spaceId, repoUrls);
          if (!validation.ok) {
            if (validation.error === "composio_not_configured") {
              apiRequestsCompleted.add(1, { route: "spaces.config", method, outcome: "missing_config" });
              return sendJson(res, 503, { error: "COMPOSIO_API_KEY is required to connect repositories" });
            }
            if (validation.error === "invalid_repo_url") {
              apiRequestsCompleted.add(1, { route: "spaces.config", method, outcome: "invalid_request" });
              return sendJson(res, 400, { error: validation.error, url: validation.url });
            }
            if (validation.error === "repo_inaccessible") {
              apiRequestsCompleted.add(1, { route: "spaces.config", method, outcome: "forbidden" });
              return sendJson(res, 403, {
                error: validation.error,
                url: validation.url,
                message: validation.message,
              });
            }
            apiRequestsCompleted.add(1, { route: "spaces.config", method, outcome: "forbidden" });
            return sendJson(res, 403, { error: "github_not_connected" });
          }
        }
        const result = await updateSpaceConfig(db, spaceId, {
          enabledTools: body.enabledTools !== undefined ? asStringArray(body.enabledTools) : undefined,
          availableConnections:
            body.availableConnections !== undefined ? asStringArray(body.availableConnections) : undefined,
          enabledConnections: body.enabledConnections !== undefined ? asStringArray(body.enabledConnections) : undefined,
          repoUrls: body.repoUrls !== undefined ? asStringArray(body.repoUrls) : undefined,
          autoApproveReadOnlyComposio:
            typeof body.autoApproveReadOnlyComposio === "boolean" ? body.autoApproveReadOnlyComposio : undefined,
        });
        if (!result) return sendJson(res, 404, { error: "Not found" });
        apiRequestsCompleted.add(1, { route: "spaces.config", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "space.id": spaceId });
        return sendJson(res, 200, result);
      }

      if (
        method === "POST" &&
        segments[0] === "spaces" &&
        segments[2] === "tools" &&
        segments[4] === "authorize"
      ) {
        const spaceId = segments[1];
        const toolkit = decodeURIComponent(segments[3] ?? "");
        if (!spaceId || !toolkit) return sendJson(res, 400, { error: "space id and toolkit are required" });
        const space = await requireSpaceInOrg(db, spaceId, organizationId);
        if (!space) return sendJson(res, 404, { error: "Not found" });
        if (!process.env.COMPOSIO_API_KEY) {
          apiRequestsCompleted.add(1, { route: "spaces.tools.authorize", method, outcome: "missing_config" });
          return sendJson(res, 400, { error: "COMPOSIO_API_KEY is required to authenticate Composio tools" });
        }

        const current = await loadActiveSpaceConfig(db, spaceId);
        const auth = await authorizeComposioToolkit({
          apiKey: process.env.COMPOSIO_API_KEY,
          entityId: spaceId,
          toolkit,
          callbackUrl: composioCallbackUrl(spaceId, toolkit),
        });
        const result = await updateSpaceConfig(db, spaceId, {
          availableConnections: mergeConnections(current?.availableConnections, current?.enabledConnections, [toolkit]),
          enabledConnections: mergeConnections(current?.enabledConnections).filter(
            (connection) => connection.toLowerCase() !== toolkit.toLowerCase(),
          ),
        });
        if (!result) return sendJson(res, 404, { error: "Not found" });

        await recordAuditEvent(db, {
          organizationId,
          spaceId,
          actorUserId: account.user.id,
          actorType: "human",
          eventType: "tool.authorize.started",
          payload: { source: "control_plane", toolkit },
        });

        apiRequestsCompleted.add(1, { route: "spaces.tools.authorize", method, outcome: "success" });
        span.setAttributes({
          outcome: "success",
          "space.id": spaceId,
          "toolkit.id": toolkit,
          "composio.connection.id": auth.connectionId ?? "",
        });
        return sendJson(res, 200, {
          connectUrl: auth.connectUrl,
          connectionId: auth.connectionId,
          configId: result.configId,
          version: result.version,
        });
      }

      if (
        method === "GET" &&
        segments[0] === "spaces" &&
        segments[2] === "tools" &&
        segments[4] === "status"
      ) {
        const spaceId = segments[1];
        const toolkit = decodeURIComponent(segments[3] ?? "");
        if (!spaceId || !toolkit) return sendJson(res, 400, { error: "space id and toolkit are required" });
        const space = await requireSpaceInOrg(db, spaceId, organizationId);
        if (!space) return sendJson(res, 404, { error: "Not found" });
        const accountStatuses = await listComposioConnectedAccountStatuses({
          apiKey: process.env.COMPOSIO_API_KEY ?? "",
          entityId: spaceId,
        }).catch(() => ({} as Record<string, string>));
        const authStatus = accountStatuses[toolkit.trim().toLowerCase()] ?? null;
        const authState = composioAuthState({
          hasApiKey: Boolean(process.env.COMPOSIO_API_KEY),
          enabled: true,
          accountStatus: authStatus,
        });
        apiRequestsCompleted.add(1, { route: "spaces.tools.status", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "space.id": spaceId, "toolkit.id": toolkit, "toolkit.auth_state": authState });
        return sendJson(res, 200, { authState, authStatus });
      }

      if (
        method === "GET" &&
        segments[0] === "spaces" &&
        segments[2] === "approval-tools" &&
        segments.length === 3
      ) {
        const spaceId = segments[1];
        if (!spaceId) return sendJson(res, 400, { error: "space id is required" });
        const space = await requireSpaceInOrg(db, spaceId, organizationId);
        if (!space) return sendJson(res, 404, { error: "Not found" });
        const toolKeys = await listSpaceToolApprovals(db, spaceId);
        apiRequestsCompleted.add(1, { route: "spaces.approval-tools", method, outcome: "success" });
        return sendJson(res, 200, {
          toolKeys,
          native: NATIVE_APPROVABLE_TOOLS,
        });
      }

      if (
        method === "PUT" &&
        segments[0] === "spaces" &&
        segments[2] === "approval-tools" &&
        segments.length === 3
      ) {
        const spaceId = segments[1];
        if (!spaceId) return sendJson(res, 400, { error: "space id is required" });
        const space = await requireSpaceInOrg(db, spaceId, organizationId);
        if (!space) return sendJson(res, 404, { error: "Not found" });
        const body = (await readJson(req)) as { toolKey?: unknown; required?: unknown };
        const toolKey = typeof body.toolKey === "string" ? body.toolKey : "";
        if (!parseToolApprovalKey(toolKey)) {
          apiRequestsCompleted.add(1, { route: "spaces.approval-tools", method, outcome: "invalid_request" });
          return sendJson(res, 400, { error: "invalid tool key" });
        }
        const required = body.required === true;
        await setSpaceToolApproval(db, {
          organizationId,
          spaceId,
          toolKey,
          required,
        });
        await recordAuditEvent(db, {
          organizationId,
          spaceId,
          actorUserId: account.user.id,
          actorType: "human",
          eventType: "approval.tool.updated",
          payload: { toolKey, required, source: "control_plane" },
        });
        apiRequestsCompleted.add(1, { route: "spaces.approval-tools", method, outcome: "success" });
        return sendJson(res, 200, { toolKey, required });
      }

      if (
        method === "GET" &&
        segments[0] === "spaces" &&
        segments[2] === "tools" &&
        segments[4] === "actions"
      ) {
        const spaceId = segments[1];
        const toolkit = decodeURIComponent(segments[3] ?? "");
        if (!spaceId || !toolkit) return sendJson(res, 400, { error: "space id and toolkit are required" });
        const space = await requireSpaceInOrg(db, spaceId, organizationId);
        if (!space) return sendJson(res, 404, { error: "Not found" });
        if (!process.env.COMPOSIO_API_KEY) {
          apiRequestsCompleted.add(1, { route: "spaces.tools.actions", method, outcome: "missing_config" });
          return sendJson(res, 400, { error: "COMPOSIO_API_KEY is required to list tool actions" });
        }
        const actions = await listComposioToolkitActions({
          apiKey: process.env.COMPOSIO_API_KEY,
          entityId: spaceId,
          toolkit,
        }).catch(() => []);
        apiRequestsCompleted.add(1, { route: "spaces.tools.actions", method, outcome: "success" });
        return sendJson(res, 200, { actions });
      }

      if (method === "GET" && segments[0] === "approvals" && segments.length === 1) {
        const approvalItems = await buildApprovalsPayload(db, organizationId);
        apiRequestsCompleted.add(1, { route: "approvals.list", method, outcome: "success" });
        return sendJson(res, 200, { approvals: approvalItems });
      }

      if (method === "POST" && segments[0] === "approvals" && segments[2] === "respond") {
        const approvalId = segments[1];
        if (!approvalId) return sendJson(res, 400, { error: "approval id is required" });
        const body = (await readJson(req)) as { decision?: "approved" | "rejected" };
        if (body.decision !== "approved" && body.decision !== "rejected") {
          return sendJson(res, 400, { error: "decision must be approved or rejected" });
        }
        const pending = await db.select().from(approvalRequests).where(eq(approvalRequests.id, approvalId)).limit(1);
        const approval = pending[0];
        if (!approval || approval.organizationId !== organizationId || approval.status !== "pending") {
          return sendJson(res, 404, { error: "Not found or already resolved" });
        }
        if (approval.expiresAt < new Date()) {
          await expireApprovalByRequestId(db, approval.requestId);
          return sendJson(res, 410, { error: "Approval expired" });
        }
        const slackInstallation = await getSlackInstallationForOrg(db, organizationId).catch(() => null);
        const actorSlackUserId =
          slackInstallation?.installedByUserId === account.user.id
            ? slackInstallation.installedBySlackUserId ?? undefined
            : undefined;
        const allowed = await canApprove(db, {
          organizationId,
          spaceId: approval.spaceId,
          userId: account.user.id,
          slackUserId: actorSlackUserId,
          requesterSlackUserId: approval.requestedBySlackUserId ?? undefined,
        });
        if (!allowed) {
          return sendJson(res, 403, { error: "Tags approval policy does not allow you to resolve this request." });
        }
        const resolved = await resolveApprovalRequest(db, approvalId, body.decision, account.user.id);
        if (!resolved) return sendJson(res, 404, { error: "Not found or already resolved" });
        await emitApprovalResolved({
          db,
          organizationId,
          spaceId: resolved.spaceId,
          actorUserId: account.user.id,
          approvalId,
          runId: resolved.runId,
          requestId: resolved.requestId,
          decision: body.decision,
          source: "control_plane",
        });
        void notifyApprovalResolvedOnSlack({
          db,
          organizationId,
          resolved,
          decision: body.decision,
          source: "control_plane",
        }).catch(() => {});
        apiRequestsCompleted.add(1, { route: "approvals.respond", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "approval.id": approvalId, "approval.decision": body.decision });
        return sendJson(res, 200, { ok: true });
      }

      if (method === "GET" && segments[0] === "runs" && segments[2] === "events") {
        const runId = segments[1];
        if (!runId) return sendJson(res, 400, { error: "run id is required" });
        const runRows = await db
          .select()
          .from(runs)
          .where(and(eq(runs.id, runId), eq(runs.organizationId, organizationId)))
          .limit(1);
        const run = runRows[0];
        if (!run) return sendJson(res, 404, { error: "Not found" });
        const afterSeq = Number(url.searchParams.get("afterSeq") ?? "0");
        const events = await listRunEventsAfter(db, runId, afterSeq, {
          organizationId,
          spaceId: run.spaceId,
        });
        apiRequestsCompleted.add(1, { route: "runs.events", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "run.id": runId, "events.count": events.length });
        return sendJson(res, 200, {
          runId,
          events: events.map((event) => ({
            seq: Number(event.seq),
            eventType: event.eventType,
            payload: event.payload,
            createdAt: event.createdAt.toISOString(),
          })),
        });
      }

      apiRequestsCompleted.add(1, { route: "unknown", method, outcome: "not_found" });
      span.setAttribute("outcome", "not_found");
      return sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      apiRequestsCompleted.add(1, { route: "error", method, outcome: "failure" });
      console.error("[control-plane] request failed", { path: url.pathname, elapsedMs: Math.round(performance.now() - started), error });
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      return sendJson(res, status, { error: error instanceof Error ? error.message : "Internal server error" });
    } finally {
      span.end();
    }
  });
}

async function createSpaceForAccount(
  req: IncomingMessage,
  res: ServerResponse,
  db: Db,
  account: AccountContext,
  parentSpan: Span,
) {
  return await tracer.startActiveSpan("space.create", async (span) => {
    try {
      const organizationId = account.organization.id;
      const body = (await readJson(req)) as { name?: string; channel?: string; channelId?: string };
      const name = body.name?.trim();
      const channelInput = body.channel?.replace(/^#/, "").trim();
      if (!name || (!body.channelId && !channelInput)) {
        businessOperationsCompleted.add(1, { operation: "space.create", outcome: "validation_error" });
        return sendJson(res, 400, { error: "name and a Slack channel are required" });
      }

      const slack = await getAccountSlackClient(db, organizationId);
      if (!slack) {
        businessOperationsCompleted.add(1, { operation: "space.create", outcome: "slack_not_connected" });
        return sendJson(res, 400, { error: "Connect Slack before creating a Space" });
      }

      const channels = await listSlackChannels(slack.client);
      const selected = channels.find((channel) =>
        body.channelId ? channel.id === body.channelId : channel.name === channelInput,
      );
      if (!selected) {
        businessOperationsCompleted.add(1, { operation: "space.create", outcome: "channel_not_found" });
        return sendJson(res, 404, {
          error: "Slack channel not found",
          code: "channel_not_found",
        });
      }

      if (selected.isPrivate && !selected.isMember) {
        businessOperationsCompleted.add(1, { operation: "space.create", outcome: "private_channel_invite_required" });
        return sendJson(res, 409, {
          error: "Invite the Tags app to this private channel in Slack, then refresh channels.",
          code: "private_channel_invite_required",
        });
      }

      const existing = await db
        .select({ id: spaces.id })
        .from(spaces)
        .where(and(eq(spaces.workspaceId, slack.installation.id), eq(spaces.externalSpaceId, selected.id)))
        .limit(1);
      if (existing[0]) {
        businessOperationsCompleted.add(1, { operation: "space.create", outcome: "conflict" });
        return sendJson(res, 409, { error: "A Space already exists for this Slack channel" });
      }

      if (!selected.isPrivate) {
        try {
          await joinSlackChannel(slack.client, selected.id);
        } catch (error) {
          businessOperationsCompleted.add(1, { operation: "space.create", outcome: "join_failed" });
          return sendJson(res, 400, {
            error: error instanceof Error ? error.message : "Failed to join Slack channel",
          });
        }
      }

      const slug = slugify(selected.name);
      let result: { spaceId: string; configId: string };
      try {
        result = await createSpaceWithConfig(db, {
          organizationId,
          workspaceId: slack.installation.id,
          externalSpaceId: selected.id,
          name,
          slug,
          instructions: "You are Tags, an AI teammate for this Slack channel.",
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          businessOperationsCompleted.add(1, { operation: "space.create", outcome: "conflict" });
          return sendJson(res, 409, { error: "A Space already exists for this Slack channel" });
        }
        throw error;
      }

      await recordAuditEvent(db, {
        organizationId,
        spaceId: result.spaceId,
        actorUserId: account.user.id,
        actorType: "human",
        eventType: "space.created",
        payload: { source: "control_plane", slug, slackChannelId: selected.id },
      });
      businessOperationsCompleted.add(1, { operation: "space.create", outcome: "success" });
      span.setAttributes({ outcome: "success", "space.id": result.spaceId, "slack.channel.id": selected.id });
      parentSpan.setAttributes({ outcome: "success", "space.id": result.spaceId });
      return sendJson(res, 201, result);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      businessOperationsCompleted.add(1, { operation: "space.create", outcome: "failure" });
      throw error;
    } finally {
      span.end();
    }
  });
}

async function handleSlackOauthCallback(_req: IncomingMessage, res: ServerResponse, url: URL) {
  const db = getDb();
  return await tracer.startActiveSpan("slack.oauth.complete", async (span) => {
    try {
      const error = url.searchParams.get("error");
      if (error) return sendRedirect(res, dashboardRedirect({ slack_error: error }));

      const code = url.searchParams.get("code");
      const stateValue = url.searchParams.get("state");
      if (!code || !stateValue) {
        return sendRedirect(res, dashboardRedirect({ slack_error: "missing_oauth_code" }));
      }

      const state = await consumeSlackOauthState(db, stateValue);
      if (!state) return sendRedirect(res, dashboardRedirect({ slack_error: "invalid_or_expired_state" }));

      const oauth = await exchangeSlackOAuthCode({
        clientId: requireEnv("SLACK_CLIENT_ID"),
        clientSecret: requireEnv("SLACK_CLIENT_SECRET"),
        code,
        redirectUri: state.redirectUri,
      });

      const teamId = oauth.team?.id;
      const botAccessToken = oauth.access_token;
      if (!teamId || !botAccessToken) {
        return sendRedirect(res, dashboardRedirect({ slack_error: "missing_slack_installation" }));
      }

      await assertWorkspaceConnectable(db, {
        organizationId: state.organizationId,
        teamId,
      });
      const account = await getAccountForClerkUser(db, state.clerkUserId);

      await upsertSlackInstallation(db, {
        organizationId: state.organizationId,
        teamId,
        teamName: oauth.team?.name,
        botAccessToken,
        botRefreshToken: oauth.refresh_token,
        botTokenExpiresAt: oauth.expires_in
          ? new Date(Date.now() + oauth.expires_in * 1000)
          : null,
        botUserId: oauth.bot_user_id,
        appId: oauth.app_id,
        botScopes: oauth.scope?.split(",").map((scope) => scope.trim()).filter(Boolean) ?? [],
        installedBySlackUserId: oauth.authed_user?.id,
        installedByUserId: account?.user.id,
        encryptionKey: requireEnv("TAGS_ENCRYPTION_KEY"),
      });

      span.setAttributes({
        "organization.id": state.organizationId,
        "slack.team.id": teamId,
        outcome: "success",
      });
      businessOperationsCompleted.add(1, { operation: "slack.oauth.complete", outcome: "success" });
      return sendRedirect(res, dashboardRedirect({ slack: "connected" }));
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      businessOperationsCompleted.add(1, { operation: "slack.oauth.complete", outcome: "failure" });
      return sendRedirect(res, slackErrorRedirect(error));
    } finally {
      span.end();
    }
  });
}

async function handleSlackEvents(req: IncomingMessage, res: ServerResponse) {
  const rawBody = await readRawBody(req);
  if (!verifySlackRequest(req, rawBody)) {
    return sendJson(res, 401, { error: "Invalid Slack signature" });
  }

  return await tracer.startActiveSpan("slack.event.receive", async (span) => {
    try {
      const payload = JSON.parse(rawBody) as SlackEventPayload;
      if (payload.type === "url_verification") {
        businessOperationsCompleted.add(1, { operation: "slack.event.receive", outcome: "url_verification" });
        return sendJson(res, 200, { challenge: payload.challenge });
      }

      const event = payload.event;
      const teamId = payload.team_id;
      if (!teamId || !event) return sendJson(res, 200, { ok: true });
      span.setAttribute("slack.team.id", teamId);

      const db = getDb();
      const installation = await getSlackInstallationByTeamId(db, teamId);
      if (!installation) {
        businessOperationsCompleted.add(1, { operation: "slack.event.receive", outcome: "unknown_installation" });
        return sendJson(res, 404, { error: "Unknown Slack installation" });
      }

      if (
        event.bot_id ||
        event.subtype ||
        (installation.botUserId && event.user === installation.botUserId)
      ) {
        businessOperationsCompleted.add(1, { operation: "slack.event.receive", outcome: "ignored_bot" });
        return sendJson(res, 200, { ok: true });
      }

      if (event.type !== "app_mention" || !event.channel || !event.ts || !event.user) {
        businessOperationsCompleted.add(1, { operation: "slack.event.receive", outcome: "ignored" });
        return sendJson(res, 200, { ok: true });
      }

      const token = decryptSlackBotToken(installation, requireEnv("TAGS_ENCRYPTION_KEY"));
      const slack = createSlackClient(token);
      const resolved = await resolveSpaceByChannel(db, teamId, event.channel);
      const threadTs = event.thread_ts ?? event.ts;

      if (!resolved) {
        await postThreadMessage(
          slack,
          event.channel,
          threadTs,
          "This channel is not connected to a Tags Space yet. Create a Space for this Slack channel in the Tags dashboard first.",
        );
        businessOperationsCompleted.add(1, { operation: "slack.event.receive", outcome: "unmapped_channel" });
        return sendJson(res, 200, { ok: true });
      }

      let placeholderMessageTs: string | undefined;
      let placeholderIsStream = false;
      try {
        const stream = await startStream(slack, {
          channelId: event.channel,
          threadTs,
          recipientTeamId: teamId,
          recipientUserId: event.user,
        });
        placeholderMessageTs = stream.messageTs;
        placeholderIsStream = true;
      } catch {
        const message = await postThreadMessage(slack, event.channel, threadTs, "Tags is working...");
        placeholderMessageTs = message.messageTs;
      }

      await addReaction(slack, event.channel, event.ts, "eyes").catch(() => {});

      await ensureSlackUserDisplayName(slack, db, {
        organizationId: resolved.space.organizationId,
        slackUserId: event.user,
      }).catch(() => {});

      const data: TagsRunInput = {
        organizationId: resolved.space.organizationId,
        workspaceId: resolved.workspace.id,
        spaceId: resolved.space.id,
        spaceName: resolved.space.name,
        channelId: event.channel,
        teamId,
        threadTs,
        rootMessageTs: threadTs,
        triggerText: event.text ?? "",
        triggerMessageTs: event.ts,
        actorSlackUserId: event.user,
        idempotencyKey: `slack:${teamId}:${event.channel}:${threadTs}:${event.ts}`,
        appUrl: getAppUrl(),
        trigger: "mention",
        placeholderMessageTs,
        placeholderIsStream,
      };

      await inngest.send({ name: RUN_REQUESTED_EVENT, data });
      span.setAttributes({
        "organization.id": resolved.space.organizationId,
        "workspace.id": resolved.workspace.id,
        "space.id": resolved.space.id,
        "slack.channel.id": event.channel,
        outcome: "success",
      });
      businessOperationsCompleted.add(1, { operation: "slack.event.receive", outcome: "success" });
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      businessOperationsCompleted.add(1, { operation: "slack.event.receive", outcome: "failure" });
      return sendJson(res, 500, { error: error instanceof Error ? error.message : "Internal server error" });
    } finally {
      span.end();
    }
  });
}

async function handleSlackInteractions(req: IncomingMessage, res: ServerResponse) {
  const rawBody = await readRawBody(req);
  if (!verifySlackRequest(req, rawBody)) {
    return sendJson(res, 401, { error: "Invalid Slack signature" });
  }

  return await tracer.startActiveSpan("slack.interaction.resolve", async (span) => {
    try {
      const form = new URLSearchParams(rawBody);
      const rawPayload = form.get("payload");
      if (!rawPayload) return sendJson(res, 400, { error: "Missing Slack payload" });
      const payload = JSON.parse(rawPayload) as SlackInteractionPayload;
      const teamId = payload.team?.id;
      if (!teamId) return sendJson(res, 400, { error: "Missing Slack team" });

      const db = getDb();
      const installation = await getSlackInstallationByTeamId(db, teamId);
      if (!installation) return sendJson(res, 404, { error: "Unknown Slack installation" });
      const slack = createSlackClient(decryptSlackBotToken(installation, requireEnv("TAGS_ENCRYPTION_KEY")));

      if (payload.type === "block_actions") {
        const action = payload.actions?.[0];
        if (!action?.action_id) return sendJson(res, 200, { ok: true });
        if (action.action_id.startsWith("approval:")) {
          await handleApprovalInteraction(db, slack, payload, action);
          businessOperationsCompleted.add(1, { operation: "slack.interaction.resolve", outcome: "success" });
          span.setAttribute("outcome", "success");
          return sendJson(res, 200, { ok: true });
        } else if (action.action_id.startsWith("question:answer:")) {
          await handleQuestionAction(slack, payload, action);
        }
        businessOperationsCompleted.add(1, { operation: "slack.interaction.resolve", outcome: "success" });
        span.setAttribute("outcome", "success");
        return sendJson(res, 200, { ok: true });
      }

      if (payload.type === "view_submission") {
        await handleQuestionSubmission(db, slack, payload);
        businessOperationsCompleted.add(1, { operation: "slack.interaction.resolve", outcome: "success" });
        span.setAttribute("outcome", "success");
        return sendJson(res, 200, { response_action: "clear" });
      }

      return sendJson(res, 200, { ok: true });
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      businessOperationsCompleted.add(1, { operation: "slack.interaction.resolve", outcome: "failure" });
      return sendJson(res, 500, { error: error instanceof Error ? error.message : "Internal server error" });
    } finally {
      span.end();
    }
  });
}

async function handleApprovalInteraction(
  db: Db,
  slack: ReturnType<typeof createSlackClient>,
  payload: SlackBlockActionPayload,
  action: { action_id?: string; value?: string },
): Promise<null> {
  const [, verb, approvalIdFromAction] = action.action_id?.split(":") ?? [];
  const decision = verb === "approve" ? "approved" : verb === "reject" ? "rejected" : null;
  const actorSlackUserId = payload.user?.id;
  if (!decision || !actorSlackUserId) return null;

  const approvalRows = approvalIdFromAction
    ? await db.select().from(approvalRequests).where(eq(approvalRequests.id, approvalIdFromAction)).limit(1)
    : [];
  let approval = approvalRows[0];
  if (!approval && action.value) {
    const rows = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.requestId, action.value))
      .limit(1);
    approval = rows[0];
  }
  if (!approval || approval.status !== "pending") return null;

  if (approval.expiresAt < new Date()) {
    await expireApprovalByRequestId(db, approval.requestId);
    return null;
  }

  const actor = await resolveOrCreateUser(db, {
    organizationId: approval.organizationId,
    slackUserId: actorSlackUserId,
    displayName: payload.user?.username,
  });
  const allowed = await canApprove(db, {
    organizationId: approval.organizationId,
    spaceId: approval.spaceId,
    slackUserId: actorSlackUserId,
    requesterSlackUserId: approval.requestedBySlackUserId ?? undefined,
  });
  if (!allowed) {
    if (payload.channel?.id) {
      await slack.chat.postEphemeral({
        channel: payload.channel.id,
        user: actorSlackUserId,
        text: "Tags approval policy does not allow you to resolve this request.",
      }).catch(() => {});
    }
    return null;
  }

  if (payload.channel?.id && payload.message?.ts) {
    await persistApprovalSlackRef(db, approval.id, payload.channel.id, payload.message.ts);
  }

  const resolved = approvalIdFromAction
    ? await resolveApprovalRequest(db, approvalIdFromAction, decision, actor.id)
    : await resolveApprovalByRequestId(db, approval.requestId, decision, actor.id);
  if (!resolved) return null;

  const card = buildApprovalResolutionCard({
    decision,
    toolName: resolved.toolName,
    toolInput: resolved.toolInput,
    actorSlackUserId,
    source: "slack",
  });

  await emitApprovalResolved({
    db,
    organizationId: resolved.organizationId,
    spaceId: resolved.spaceId,
    actorUserId: actor.id,
    approvalId: resolved.id,
    runId: resolved.runId,
    requestId: resolved.requestId,
    decision,
    source: "slack_interaction",
  });

  if (payload.channel?.id && payload.message?.ts) {
    void updateMessage(slack, payload.channel.id, payload.message.ts, card.text, card.blocks).catch(
      () => {},
    );
  }

  return null;
}

async function handleQuestionAction(
  slack: ReturnType<typeof createSlackClient>,
  payload: SlackBlockActionPayload,
  action: { action_id?: string; value?: string },
) {
  if (!payload.trigger_id || !action.value) return;
  const db = getDb();
  const question = await getQuestionByRequestId(db, action.value);
  const questionText = question?.questionText ?? "Answer the question for Tags.";
  await slack.views.open({
    trigger_id: payload.trigger_id,
    view: {
      type: "modal",
      callback_id: "tags_question_answer",
      title: { type: "plain_text", text: "Answer Tags" },
      submit: { type: "plain_text", text: "Submit" },
      close: { type: "plain_text", text: "Cancel" },
      private_metadata: JSON.stringify({
        requestId: action.value,
        channelId: payload.channel?.id,
        messageTs: payload.message?.ts,
      }),
      blocks: [
        {
          type: "input",
          block_id: "answer",
          label: { type: "plain_text", text: questionText.slice(0, 2000) },
          element: {
            type: "plain_text_input",
            action_id: "value",
            multiline: true,
          },
        },
      ],
    },
  });
}

async function handleQuestionSubmission(
  db: Db,
  slack: ReturnType<typeof createSlackClient>,
  payload: SlackViewSubmissionPayload,
) {
  if (payload.view.callback_id !== "tags_question_answer") return;
  const metadata = JSON.parse(payload.view.private_metadata || "{}") as {
    requestId?: string;
    channelId?: string;
    messageTs?: string;
  };
  const answer = getFirstModalAnswer(payload);
  if (!metadata.requestId || !answer) return;

  const question = await answerQuestionByRequestId(db, metadata.requestId, answer);
  if (!question) return;
  await inngest.send({
    name: QUESTION_ANSWERED_EVENT,
    data: { requestId: question.requestId, answer },
  });

  if (metadata.channelId && metadata.messageTs && payload.user?.id) {
    await updateMessage(
      slack,
      metadata.channelId,
      metadata.messageTs,
      "Question answered.",
      questionAnsweredBlocks({ actorSlackUserId: payload.user.id }),
    ).catch(() => {});
  }
}

async function handleMcpApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const rawBody = await readRawBody(req);
  const request = new Request(url.href, {
    method: req.method,
    headers: incomingHeaders(req),
    ...(rawBody && req.method !== "GET" && req.method !== "HEAD" ? { body: rawBody } : {}),
  });
  const secrets = loadRuntimeSecrets();
  const response = await handleTagsMcpRequest(request, {
    signingSecret: secrets.mcpSigningKey ?? "",
    db: getDb(),
    providerConfig: buildRuntimeProviderConfig(secrets),
    encryptionKey: secrets.encryptionKey,
    appUrl: secrets.appUrl,
  });
  return writeWebResponse(res, response);
}

async function handleComposioMcpApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const rawBody = await readRawBody(req);
  const request = new Request(url.href, {
    method: req.method,
    headers: incomingHeaders(req),
    ...(rawBody && req.method !== "GET" && req.method !== "HEAD" ? { body: rawBody } : {}),
  });
  const secrets = loadRuntimeSecrets();
  const response = await handleComposioMcpRequest(request, {
    signingSecret: secrets.mcpSigningKey ?? "",
    db: getDb(),
    providerConfig: buildRuntimeProviderConfig(secrets),
    appUrl: secrets.appUrl,
  });
  return writeWebResponse(res, response);
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function parseByteRange(
  rangeHeader: string,
  size: number,
): { start: number; end: number } | "invalid" | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return "invalid";
  const rawStart = match[1];
  const rawEnd = match[2];
  if (!rawStart && !rawEnd) return "invalid";

  let start: number;
  let end: number;
  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
  }

  if (start < 0 || end < start || start >= size) return "invalid";
  return { start, end: Math.min(end, size - 1) };
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL) {
  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === "/" ? "/index.html" : pathname;
  let filePath = path.join(distRoot, requested);
  if (!filePath.startsWith(distRoot)) return sendJson(res, 403, { error: "Forbidden" });
  if (!existsSync(filePath) || !(await stat(filePath)).isFile()) {
    filePath = path.join(distRoot, "index.html");
  }

  const fileStat = await stat(filePath);
  const contentType = mimeTypes[path.extname(filePath)] ?? "application/octet-stream";
  const size = fileStat.size;
  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, size);
    if (range === "invalid") {
      res.writeHead(416, {
        "content-range": `bytes */${size}`,
        "accept-ranges": "bytes",
      });
      res.end();
      return;
    }
    if (range) {
      res.writeHead(206, {
        "content-type": contentType,
        "content-length": range.end - range.start + 1,
        "content-range": `bytes ${range.start}-${range.end}/${size}`,
        "accept-ranges": "bytes",
      });
      createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
      return;
    }
  }

  res.writeHead(200, {
    "content-type": contentType,
    "content-length": size,
    "accept-ranges": "bytes",
  });
  createReadStream(filePath).pipe(res);
}

async function createAppServer() {
  let vite: ViteDevServer | null = null;
  if (!isProduction) {
    vite = await createViteServer({
      root: appRoot,
      server: { middlewareMode: true },
      appType: "spa",
    });
  } else if (!existsSync(path.join(distRoot, "index.html"))) {
    throw new Error("Production build not found. Run `pnpm --filter @tags/control-plane build` first.");
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
    if (vite) return vite.middlewares(req, res, () => sendJson(res, 404, { error: "Not found" }));
    return serveStatic(req, res, url);
  });
}

const server = await createAppServer();
server.listen(port, () => {
  console.log(`[control-plane] listening on http://localhost:${port}`);
});
