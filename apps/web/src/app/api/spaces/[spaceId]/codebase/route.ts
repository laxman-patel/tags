import { testGitHubRepoAccessWithComposio } from "@tags/runtime/integrations/composio-github";
import {
  listComposioConnectedAccountStatuses,
  loadComposioTools,
} from "@tags/runtime/tools/composio";
import { recordAuditEvent } from "@tags/core/audit";
import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { getSpaceById } from "@tags/core/spaces-admin";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getEnv } from "@/env";
import { getDb } from "@/lib/db";
import { parseGitHubRepo } from "@/lib/github-repo";

export const runtime = "nodejs";

async function loadGitHubConnectionStatus(spaceId: string, apiKey?: string) {
  if (!apiKey) return "missing_api_key";
  const statuses = await listComposioConnectedAccountStatuses({ apiKey, entityId: spaceId });
  return statuses.github === "ACTIVE" ? "connected" : "needs_auth";
}

async function testGitHubRepo(repoUrl: string | null | undefined, spaceId: string, apiKey?: string) {
  const parsed = parseGitHubRepo(repoUrl);
  if (!parsed) {
    return {
      ok: false,
      status: "unsupported_url",
      message: "Use a GitHub HTTPS or SSH repo URL.",
    };
  }

  if (!apiKey) {
    return {
      ok: false,
      status: "missing_composio_api_key",
      message: "Configure COMPOSIO_API_KEY before testing GitHub repo access.",
    };
  }

  const githubConnectionStatus = await loadGitHubConnectionStatus(spaceId, apiKey);
  if (githubConnectionStatus !== "connected") {
    return {
      ok: false,
      status: "github_not_connected",
      message: "Connect the Space's GitHub account through Composio before testing repo access.",
    };
  }

  const handle = await loadComposioTools({
    apiKey,
    entityId: spaceId,
    toolkits: ["github"],
  });

  if (!handle) {
    return {
      ok: false,
      status: "github_tool_unavailable",
      message: "Composio GitHub tools are unavailable for this Space.",
    };
  }

  try {
    return await testGitHubRepoAccessWithComposio({
      tools: handle.tools,
      owner: parsed.owner,
      repo: parsed.repo,
    });
  } finally {
    await handle.close();
  }
}

function resolveRepoUrls(config: Awaited<ReturnType<typeof loadActiveSpaceConfig>>) {
  if (!config) return [];
  return config.repoUrls?.length
    ? config.repoUrls
    : config.repoUrl
      ? [config.repoUrl]
      : [];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();

  const { spaceId } = await params;
  const db = getDb();
  const space = await getSpaceById(db, spaceId);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });

  const config = await loadActiveSpaceConfig(db, spaceId);
  const repoUrls = resolveRepoUrls(config);
  const env = getEnv();
  const githubConnectionStatus = await loadGitHubConnectionStatus(spaceId, env.COMPOSIO_API_KEY);
  return Response.json({
    repoUrl: repoUrls[0] ?? null,
    repoUrls,
    repos: repoUrls.map((url) => ({
      url,
      parsedGitHubRepo: parseGitHubRepo(url),
    })),
    hasComposioApiKey: Boolean(env.COMPOSIO_API_KEY),
    githubConnectionStatus,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!(await isAdminAuthorized())) return adminUnauthorizedResponse();

  const { spaceId } = await params;
  const db = getDb();
  const space = await getSpaceById(db, spaceId);
  if (!space) return Response.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { repoUrl?: string };
  const config = await loadActiveSpaceConfig(db, spaceId);
  const repoUrls = resolveRepoUrls(config);
  const repoUrl = body.repoUrl?.trim() || repoUrls[0] || null;
  const env = getEnv();
  const githubConnectionStatus = await loadGitHubConnectionStatus(spaceId, env.COMPOSIO_API_KEY);
  const result = await testGitHubRepo(repoUrl, spaceId, env.COMPOSIO_API_KEY);

  await recordAuditEvent(db, {
    organizationId: space.organizationId,
    spaceId,
    actorType: "human",
    eventType: "codebase.access_tested",
    payload: { repoUrl, ok: result.ok, status: result.status },
  });

  return Response.json({
    repoUrl,
    repoUrls,
    testedRepoUrl: repoUrl,
    parsedGitHubRepo: parseGitHubRepo(repoUrl),
    hasComposioApiKey: Boolean(env.COMPOSIO_API_KEY),
    githubConnectionStatus,
    result,
  });
}
