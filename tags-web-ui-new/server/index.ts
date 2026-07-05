import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  createSpaceConfigVersion,
  createSpaceWithConfig,
  getSpaceById,
  listSpaces,
} from "@tags/core/spaces-admin";
import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { recordAuditEvent } from "@tags/core/audit";
import { getUsageBySpace } from "@tags/core/usage";
import {
  expireApprovalByRequestId,
  listPendingApprovals,
  listRunEventsAfter,
  resolveApprovalRequest,
} from "@tags/core/runs";
import {
  approvalRequests,
  count,
  createDb,
  desc,
  eq,
  inArray,
  organizations,
  runs,
  spaces,
  toolInvocations,
  workspaces,
  type Db,
} from "@tags/db";
import { APPROVAL_RESOLVED_EVENT, inngest } from "@tags/runtime";
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

let db: Db | null = null;

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

function getDb(): Db {
  if (!db) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    db = createDb(process.env.DATABASE_URL);
  }
  return db;
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

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) return {};
  return JSON.parse(body);
}

function requireAdmin(req: IncomingMessage): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return true;
  const auth = req.headers.authorization;
  const header = req.headers["x-tags-admin-token"];
  return auth === `Bearer ${token}` || header === token;
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

async function getDefaultOrgId(db: Db) {
  const orgsWithSpaces = await db
    .select({ id: organizations.id })
    .from(organizations)
    .innerJoin(spaces, eq(spaces.organizationId, organizations.id))
    .limit(1);
  if (orgsWithSpaces[0]?.id) return orgsWithSpaces[0].id;

  const rows = await db.select().from(organizations).limit(1);
  return rows[0]?.id ?? "";
}

async function getDefaultWorkspace(db: Db, organizationId: string) {
  const rows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
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
  if (status === "succeeded") return "success";
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  return "pending";
}

function repoName(repoUrl: string) {
  return repoUrl
    .replace(/^git@github.com:/, "")
    .replace(/^https:\/\/github.com\//, "")
    .replace(/\.git$/, "");
}

function toolMetadata(toolId: string) {
  const byId: Record<string, { name: string; description: string; provider: string }> = {
    search_thread: { name: "search_thread", description: "Search messages in the current thread", provider: "Tags" },
    search_channel: { name: "search_channel", description: "Search Slack channel history", provider: "Slack" },
    search_memory: { name: "search_memory", description: "Search saved memory for this space", provider: "Tags" },
    save_memory: { name: "save_memory", description: "Save durable memory from a run", provider: "Tags" },
    session_search: { name: "session_search", description: "Search previous coding sessions", provider: "Tags" },
    create_artifact: { name: "create_artifact", description: "Create files, reports, and rich artifacts", provider: "Tags" },
    github: { name: "github", description: "Read and write GitHub resources", provider: "GitHub" },
    slack_post: { name: "slack_post", description: "Post messages to Slack channels", provider: "Slack" },
  };
  return byId[toolId] ?? { name: toolId, description: `Use ${toolId} through the agent runtime`, provider: "Composio" };
}

async function buildSpacesPayload(db: Db, organizationId: string) {
  const rows = await listSpaces(db, organizationId);
  return Promise.all(
    rows.map(async (row) => {
      const config = await loadActiveSpaceConfig(db, row.space.id);
      const usage = await getUsageBySpace(db, row.space.id);
      const runCount = Number(usage.summary?.runCount ?? 0);
      const totalTokens = Number(usage.summary?.totalTokens ?? 0);
      const costMicroUsd = Number(usage.summary?.costMicroUsd ?? 0);
      const repos = (config?.repoUrls ?? []).map((url, index) => ({
        id: url,
        name: repoName(url),
        isDefault: index === 0,
      }));
      const enabledTools = config?.enabledTools ?? [];
      return {
        id: row.space.id,
        name: row.space.name,
        channel: row.space.slug || row.space.externalSpaceId,
        status: "active",
        lastRun: formatDate(row.space.updatedAt),
        runCount,
        tokenUsage: totalTokens,
        cost: costMicroUsd / 1_000_000,
        recentActivity: runCount > 0 ? `${runCount} recorded runs` : "No runs yet",
        tools: enabledTools.map((toolId) => ({
          id: toolId,
          enabled: true,
          authState: "connected",
          ...toolMetadata(toolId),
        })),
        repos,
        modelId: config?.modelId,
        instructions: config?.instructions,
        workspaceName: row.workspace.name,
        workspaceTeamId: row.workspace.externalWorkspaceId,
      };
    }),
  );
}

async function buildRunsPayload(db: Db, organizationId: string) {
  const rows = await db
    .select({
      run: runs,
      spaceName: spaces.name,
      spaceSlug: spaces.slug,
      externalSpaceId: spaces.externalSpaceId,
    })
    .from(runs)
    .innerJoin(spaces, eq(runs.spaceId, spaces.id))
    .where(eq(runs.organizationId, organizationId))
    .orderBy(desc(runs.startedAt))
    .limit(100);

  const runIds = rows.map((row) => row.run.id);
  const counts =
    runIds.length > 0
      ? await db
          .select({ runId: toolInvocations.runId, count: count() })
          .from(toolInvocations)
          .where(inArray(toolInvocations.runId, runIds))
          .groupBy(toolInvocations.runId)
      : [];
  const countByRun = new Map(counts.map((entry) => [entry.runId, Number(entry.count)]));

  return rows.map((row) => ({
    id: row.run.id,
    spaceId: row.run.spaceId,
    spaceName: row.spaceName,
    channel: row.spaceSlug || row.externalSpaceId,
    status: runStatus(row.run.status),
    startedAt: formatDate(row.run.startedAt),
    duration: duration(row.run.startedAt, row.run.finishedAt),
    toolCalls: countByRun.get(row.run.id) ?? 0,
    triggeredBy: row.run.trigger,
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
      channel: space?.slug ?? space?.externalSpaceId ?? "unknown",
      action: approval.toolName,
      description: approval.requestText,
      requestedAt: formatDate(approval.createdAt),
      requestedBy: approval.requestedBySlackUserId ?? "agent",
      context: JSON.stringify(approval.toolInput),
    };
  });
}

async function loadControlPlane(db: Db, req: IncomingMessage) {
  const organizationId = String(req.headers["x-tags-org-id"] ?? "") || (await getDefaultOrgId(db));
  if (!organizationId) return { organizationId: "", spaces: [], runs: [], approvals: [] };
  const [spaceItems, runItems, approvalItems] = await Promise.all([
    buildSpacesPayload(db, organizationId),
    buildRunsPayload(db, organizationId),
    buildApprovalsPayload(db, organizationId),
  ]);
  return { organizationId, spaces: spaceItems, runs: runItems, approvals: approvalItems };
}

async function updateSpaceConfig(
  db: Db,
  spaceId: string,
  patch: {
    enabledTools?: string[];
    enabledConnections?: string[];
    repoUrls?: string[];
  },
) {
  const space = await getSpaceById(db, spaceId);
  if (!space) return null;
  const current = await loadActiveSpaceConfig(db, spaceId);
  const result = await createSpaceConfigVersion(db, {
    spaceId,
    organizationId: space.organizationId,
    modelId: current?.modelId ?? "accounts/fireworks/models/kimi-k2-instruct",
    reasoning: current?.reasoning,
    instructions: current?.instructions ?? "You are Tags, an AI teammate for this Slack channel.",
    enabledSkills: current?.enabledSkills ?? [],
    enabledTools: patch.enabledTools ?? current?.enabledTools ?? [],
    enabledConnections: patch.enabledConnections ?? current?.enabledConnections ?? [],
    maxSteps: current?.maxSteps,
    runtimeMode: "opencode",
    repoUrls: patch.repoUrls ?? current?.repoUrls ?? [],
    passiveLearningMode: current?.passiveLearningMode,
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

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (!requireAdmin(req)) return sendJson(res, 401, { error: "Unauthorized" });

  const method = req.method ?? "GET";
  const segments = url.pathname.split("/").filter(Boolean).slice(1);

  return await tracer.startActiveSpan(`control_plane.${method.toLowerCase()}`, async (span) => {
    const started = performance.now();
    try {
      const db = getDb();
      span.setAttributes({ "http.method": method, "http.route": url.pathname });

      if (method === "GET" && segments[0] === "control-plane") {
        const payload = await loadControlPlane(db, req);
        apiRequestsCompleted.add(1, { route: "control-plane", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "spaces.count": payload.spaces.length, "runs.count": payload.runs.length });
        return sendJson(res, 200, payload);
      }

      if (method === "POST" && segments[0] === "spaces" && segments.length === 1) {
        const body = (await readJson(req)) as { name?: string; channel?: string; organizationId?: string; workspaceId?: string };
        const organizationId = body.organizationId || (await getDefaultOrgId(db));
        const workspace = body.workspaceId ? null : await getDefaultWorkspace(db, organizationId);
        const workspaceId = body.workspaceId ?? workspace?.id;
        if (!organizationId || !workspaceId || !body.name || !body.channel) {
          apiRequestsCompleted.add(1, { route: "spaces", method, outcome: "validation_error" });
          return sendJson(res, 400, { error: "name, channel, organization, and workspace are required" });
        }
        const slug = slugify(body.channel);
        const result = await createSpaceWithConfig(db, {
          organizationId,
          workspaceId,
          externalSpaceId: body.channel,
          name: body.name,
          slug,
          modelId: "accounts/fireworks/models/kimi-k2-instruct",
          instructions: "You are Tags, an AI teammate for this Slack channel.",
        });
        await recordAuditEvent(db, {
          organizationId,
          spaceId: result.spaceId,
          actorType: "human",
          eventType: "space.created",
          payload: { source: "control_plane", slug },
        });
        apiRequestsCompleted.add(1, { route: "spaces", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "space.id": result.spaceId });
        return sendJson(res, 201, result);
      }

      if (method === "PATCH" && segments[0] === "spaces" && segments[2] === "config") {
        const spaceId = segments[1];
        if (!spaceId) return sendJson(res, 400, { error: "space id is required" });
        const body = (await readJson(req)) as { enabledTools?: unknown; enabledConnections?: unknown; repoUrls?: unknown };
        const result = await updateSpaceConfig(db, spaceId, {
          enabledTools: body.enabledTools !== undefined ? asStringArray(body.enabledTools) : undefined,
          enabledConnections: body.enabledConnections !== undefined ? asStringArray(body.enabledConnections) : undefined,
          repoUrls: body.repoUrls !== undefined ? asStringArray(body.repoUrls) : undefined,
        });
        if (!result) return sendJson(res, 404, { error: "Not found" });
        apiRequestsCompleted.add(1, { route: "spaces.config", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "space.id": spaceId });
        return sendJson(res, 200, result);
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
        if (!approval || approval.status !== "pending") return sendJson(res, 404, { error: "Not found or already resolved" });
        if (approval.expiresAt < new Date()) {
          await expireApprovalByRequestId(db, approval.requestId);
          return sendJson(res, 410, { error: "Approval expired" });
        }
        const resolved = await resolveApprovalRequest(db, approvalId, body.decision);
        if (!resolved) return sendJson(res, 404, { error: "Not found or already resolved" });
        await recordAuditEvent(db, {
          organizationId: resolved.organizationId,
          spaceId: resolved.spaceId,
          actorType: "human",
          eventType: "approval.resolved",
          payload: { approvalId, decision: body.decision, source: "control_plane" },
        });
        await inngest.send({ name: APPROVAL_RESOLVED_EVENT, data: { requestId: resolved.requestId, decision: body.decision } });
        apiRequestsCompleted.add(1, { route: "approvals.respond", method, outcome: "success" });
        span.setAttributes({ outcome: "success", "approval.id": approvalId, "approval.decision": body.decision });
        return sendJson(res, 200, { ok: true });
      }

      if (method === "GET" && segments[0] === "runs" && segments[2] === "events") {
        const runId = segments[1];
        if (!runId) return sendJson(res, 400, { error: "run id is required" });
        const afterSeq = Number(url.searchParams.get("afterSeq") ?? "0");
        const events = await listRunEventsAfter(db, runId, afterSeq);
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
      return sendJson(res, 500, { error: error instanceof Error ? error.message : "Internal server error" });
    } finally {
      span.end();
    }
  });
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
};

async function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL) {
  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === "/" ? "/index.html" : pathname;
  let filePath = path.join(distRoot, requested);
  if (!filePath.startsWith(distRoot)) return sendJson(res, 403, { error: "Forbidden" });
  if (!existsSync(filePath) || !(await stat(filePath)).isFile()) filePath = path.join(distRoot, "index.html");
  res.writeHead(200, { "content-type": mimeTypes[path.extname(filePath)] ?? "application/octet-stream" });
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
