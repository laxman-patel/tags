import { recordAuditEvent } from "@tags/core/audit";
import { loadActiveSpaceConfig } from "@tags/core/spaces";
import { getSpaceById } from "@tags/core/spaces-admin";
import { adminUnauthorizedResponse, isAdminAuthorized } from "@/lib/admin-auth";
import { getEnv } from "@/env";
import { getDb } from "@/lib/db";
import { parseGitHubRepo } from "@/lib/github-repo";

export const runtime = "nodejs";

async function testGitHubRepo(repoUrl: string | null | undefined, token?: string) {
  const parsed = parseGitHubRepo(repoUrl);
  if (!parsed) {
    return {
      ok: false,
      status: "unsupported_url",
      message: "Use a GitHub HTTPS or SSH repo URL.",
    };
  }

  const response = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
    headers: {
      accept: "application/vnd.github+json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.ok) {
    const data = (await response.json()) as { private?: boolean; default_branch?: string };
    return {
      ok: true,
      status: "reachable",
      private: Boolean(data.private),
      defaultBranch: data.default_branch ?? null,
      message: "Repository metadata is reachable.",
    };
  }

  return {
    ok: false,
    status: response.status === 404 ? "not_found_or_no_access" : "request_failed",
    httpStatus: response.status,
    message:
      response.status === 404
        ? "Repository was not found or the configured token cannot access it."
        : `GitHub returned HTTP ${response.status}.`,
  };
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
  return Response.json({
    repoUrl: repoUrls[0] ?? null,
    repoUrls,
    repos: repoUrls.map((url) => ({
      url,
      parsedGitHubRepo: parseGitHubRepo(url),
    })),
    hasGlobalGitHubToken: Boolean(env.GITHUB_TOKEN),
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
  const result = await testGitHubRepo(repoUrl, env.GITHUB_TOKEN);

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
    hasGlobalGitHubToken: Boolean(env.GITHUB_TOKEN),
    result,
  });
}
