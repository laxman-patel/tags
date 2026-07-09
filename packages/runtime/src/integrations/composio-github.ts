import { Composio } from "@composio/core";

const GITHUB_LIST_REPO_TOOL_SLUGS = [
  "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
  "GITHUB_LIST_REPOS",
  "GITHUB_GET_REPOS",
] as const;

const GITHUB_GET_REPO_TOOL_SLUGS = ["GITHUB_GET_A_REPOSITORY", "GITHUB_GET_REPOSITORY"] as const;

export type GitHubPrRef = {
  owner: string;
  repo: string;
  number: number;
};

export type GitHubRepoAccessResult =
  | {
      ok: true;
      status: "reachable";
      private: boolean;
      defaultBranch: string | null;
      message: string;
    }
  | {
      ok: false;
      status: "github_tool_unavailable" | "request_failed";
      message: string;
    };

type ComposioExecutableTool = {
  execute?: (input: any, options: any) => Promise<unknown>;
};

export type ComposioToolMap = Record<string, ComposioExecutableTool>;

export type GitHubRepoSummary = {
  id: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  defaultBranch?: string | null;
};

export type GitHubRepoListResult =
  | {
      ok: true;
      repos: GitHubRepoSummary[];
    }
  | {
      ok: false;
      status: "github_tool_unavailable" | "request_failed";
      message: string;
    };

export type GitHubRepoRef = {
  owner: string;
  repo: string;
};

export function parseGitHubRepoUrl(url: string): GitHubRepoRef | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
    if (!owner || !repo) return null;
    if (repo.endsWith(".git")) {
      return { owner, repo: repo.slice(0, -4) };
    }
    return { owner, repo };
  } catch {
    return null;
  }
}

export function parseGitHubPrUrl(url: string): GitHubPrRef | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const [owner, repo, pull, number] = parsed.pathname.split("/").filter(Boolean);
    if (!owner || !repo || pull !== "pull" || !number) return null;
    const prNumber = Number(number);
    if (!Number.isInteger(prNumber) || prNumber <= 0) return null;
    return { owner, repo, number: prNumber };
  } catch {
    return null;
  }
}

function findTool(tools: ComposioToolMap, patterns: RegExp[]): [string, ComposioExecutableTool] | null {
  for (const [name, tool] of Object.entries(tools)) {
    if (!tool.execute) continue;
    if (patterns.some((pattern) => pattern.test(name))) {
      return [name, tool];
    }
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.items)) return record.items;
    if (Array.isArray(record.comments)) return record.comments;
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.repositories)) return record.repositories;
    if (Array.isArray(record.repos)) return record.repos;
  }
  return [];
}

function composioExecuteError(result: { error?: unknown }): string {
  if (typeof result.error === "string") return result.error;
  if (typeof result.error === "object" && result.error !== null && "message" in result.error) {
    const message = (result.error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Composio tool execution failed";
}

function normalizeGitHubRepoList(value: unknown): GitHubRepoSummary[] {
  return asArray(value)
    .map((item) => normalizeGitHubRepo(item))
    .filter((item): item is GitHubRepoSummary => item !== null)
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
}

function commentId(value: unknown): number | string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const id = record.id ?? record.comment_id ?? record.commentId;
  return typeof id === "number" || typeof id === "string" ? id : undefined;
}

function commentBody(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const body = (value as Record<string, unknown>).body;
  return typeof body === "string" ? body : undefined;
}

function commentHtmlUrl(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const url = record.html_url ?? record.htmlUrl ?? record.url;
  return typeof url === "string" ? url : undefined;
}

function resultRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  const data = record.data;
  if (typeof data === "object" && data !== null) return data as Record<string, unknown>;
  return record;
}

function resultMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function repoFullName(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const fullName = record.full_name ?? record.fullName;
  return typeof fullName === "string" ? fullName : undefined;
}

function repoHtmlUrl(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const url = record.html_url ?? record.htmlUrl;
  return typeof url === "string" ? url : undefined;
}

function repoId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const id = record.id ?? record.node_id ?? record.nodeId;
  return typeof id === "number" || typeof id === "string" ? String(id) : undefined;
}

function repoDefaultBranch(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const branch = record.default_branch ?? record.defaultBranch;
  return typeof branch === "string" ? branch : null;
}

function normalizeGitHubRepo(value: unknown): GitHubRepoSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const fullName = repoFullName(record);
  const htmlUrl = repoHtmlUrl(record);
  if (!fullName || !htmlUrl) return null;
  return {
    id: repoId(record) ?? fullName,
    fullName,
    htmlUrl,
    private: Boolean(record.private),
    defaultBranch: repoDefaultBranch(record),
  };
}

export async function listGitHubReposForEntity(args: {
  apiKey: string;
  entityId: string;
}): Promise<GitHubRepoListResult> {
  const composio = new Composio({ apiKey: args.apiKey });
  let lastMessage = "Composio GitHub repository list tool is unavailable.";

  for (const slug of GITHUB_LIST_REPO_TOOL_SLUGS) {
    try {
      const result = await composio.tools.execute(slug, {
        userId: args.entityId,
        arguments: {},
        dangerouslySkipVersionCheck: true,
      });
      if (!result.successful) {
        lastMessage = composioExecuteError(result);
        continue;
      }
      return { ok: true, repos: normalizeGitHubRepoList(result.data) };
    } catch (error) {
      lastMessage = `Composio GitHub repo list failed: ${resultMessage(error)}`;
    }
  }

  return {
    ok: false,
    status: "request_failed",
    message: lastMessage,
  };
}

export async function listGitHubReposWithComposio(args: {
  tools: ComposioToolMap;
}): Promise<GitHubRepoListResult> {
  const listTool = findTool(args.tools, [
    /^GITHUB_GET_REPOS$/i,
    /^GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER$/i,
    /github.*list.*repositor/i,
    /github.*get.*repos$/i,
  ]);

  if (!listTool) {
    return {
      ok: false,
      status: "github_tool_unavailable",
      message: "Composio GitHub repository list tool is unavailable.",
    };
  }

  try {
    const [, tool] = listTool;
    const result = await tool.execute!({}, {});
    const repos = normalizeGitHubRepoList(result);
    return { ok: true, repos };
  } catch (error) {
    return {
      ok: false,
      status: "request_failed",
      message: `Composio GitHub repo list failed: ${resultMessage(error)}`,
    };
  }
}

export async function testGitHubRepoAccessForEntity(args: {
  apiKey: string;
  entityId: string;
  owner: string;
  repo: string;
}): Promise<GitHubRepoAccessResult> {
  const composio = new Composio({ apiKey: args.apiKey });
  let lastMessage = "Composio GitHub repository metadata tool is unavailable.";

  for (const slug of GITHUB_GET_REPO_TOOL_SLUGS) {
    try {
      const result = await composio.tools.execute(slug, {
        userId: args.entityId,
        arguments: { owner: args.owner, repo: args.repo },
        dangerouslySkipVersionCheck: true,
      });
      if (!result.successful) {
        lastMessage = composioExecuteError(result);
        continue;
      }
      const record = resultRecord(result.data);
      return {
        ok: true,
        status: "reachable",
        private: Boolean(record.private),
        defaultBranch:
          typeof record.default_branch === "string"
            ? record.default_branch
            : typeof record.defaultBranch === "string"
              ? record.defaultBranch
              : null,
        message: "Repository metadata is reachable through the Space's Composio GitHub connection.",
      };
    } catch (error) {
      lastMessage = `Composio GitHub repo check failed: ${resultMessage(error)}`;
    }
  }

  return {
    ok: false,
    status: "github_tool_unavailable",
    message: lastMessage,
  };
}

export async function testGitHubRepoAccessWithComposio(args: {
  tools: ComposioToolMap;
  owner: string;
  repo: string;
}): Promise<GitHubRepoAccessResult> {
  const getRepoTool = findTool(args.tools, [
    /^GITHUB_GET_A_REPOSITORY$/i,
    /^GITHUB_GET_REPOSITORY$/i,
    /github.*get.*repo/i,
    /github.*repo.*get/i,
  ]);

  if (!getRepoTool) {
    return {
      ok: false,
      status: "github_tool_unavailable",
      message: "Composio GitHub repository metadata tool is unavailable.",
    };
  }

  try {
    const [, tool] = getRepoTool;
    const result = resultRecord(await tool.execute!({ owner: args.owner, repo: args.repo }, {}));
    return {
      ok: true,
      status: "reachable",
      private: Boolean(result.private),
      defaultBranch:
        typeof result.default_branch === "string"
          ? result.default_branch
          : typeof result.defaultBranch === "string"
            ? result.defaultBranch
            : null,
      message: "Repository metadata is reachable through the Space's Composio GitHub connection.",
    };
  } catch (error) {
    return {
      ok: false,
      status: "request_failed",
      message: `Composio GitHub repo check failed: ${resultMessage(error)}`,
    };
  }
}
