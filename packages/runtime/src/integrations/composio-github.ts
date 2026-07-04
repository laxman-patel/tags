const MARKER_PREFIX = "<!-- tags-demo-recording:";

export type GitHubPrRef = {
  owner: string;
  repo: string;
  number: number;
};

type ComposioExecutableTool = {
  execute?: (input: any, options: any) => Promise<unknown>;
};

export type ComposioToolMap = Record<string, ComposioExecutableTool>;

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

function marker(runId: string): string {
  return `${MARKER_PREFIX}${runId} -->`;
}

function buildCommentBody(args: {
  runId: string;
  artifactUrl: string;
  appUrl: string;
  slackPermalink?: string;
}): string {
  return `${marker(args.runId)}
Demo recording for this Tags run: [watch MP4](${args.artifactUrl})

Run timeline: ${args.appUrl}/runs/${args.runId}${args.slackPermalink ? `\nSlack upload: ${args.slackPermalink}` : ""}`;
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
  }
  return [];
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

export async function upsertDemoRecordingCommentWithComposio(args: {
  tools: ComposioToolMap;
  prUrl: string;
  runId: string;
  artifactUrl: string;
  appUrl: string;
  slackPermalink?: string;
}): Promise<{ htmlUrl?: string }> {
  const ref = parseGitHubPrUrl(args.prUrl);
  if (!ref) throw new Error(`Unsupported GitHub PR URL: ${args.prUrl}`);

  const listTool = findTool(args.tools, [
    /^GITHUB_LIST_COMMENTS_IN_AN_ISSUE$/i,
    /github.*list.*comments.*issue/i,
    /github.*issue.*comments.*list/i,
  ]);
  const createTool = findTool(args.tools, [
    /^GITHUB_CREATE_AN_ISSUE_COMMENT$/i,
    /github.*create.*issue.*comment/i,
  ]);
  const updateTool = findTool(args.tools, [
    /^GITHUB_UPDATE_AN_ISSUE_COMMENT$/i,
    /github.*update.*issue.*comment/i,
  ]);

  if (!createTool) {
    throw new Error("Composio GitHub create issue comment tool is unavailable");
  }

  const body = buildCommentBody(args);
  let existing: unknown | undefined;

  if (listTool) {
    const [, tool] = listTool;
    const result = await tool.execute!(
      {
        owner: ref.owner,
        repo: ref.repo,
        issue_number: ref.number,
        issueNumber: ref.number,
      },
      {},
    );
    existing = asArray(result).find((comment) => commentBody(comment)?.includes(marker(args.runId)));
  }

  if (existing && updateTool) {
    const id = commentId(existing);
    if (id !== undefined) {
      const [, tool] = updateTool;
      const result = await tool.execute!(
        {
          owner: ref.owner,
          repo: ref.repo,
          comment_id: id,
          commentId: id,
          body,
        },
        {},
      );
      return { htmlUrl: commentHtmlUrl(result) ?? commentHtmlUrl(existing) };
    }
  }

  const [, create] = createTool;
  const result = await create.execute!(
    {
      owner: ref.owner,
      repo: ref.repo,
      issue_number: ref.number,
      issueNumber: ref.number,
      body,
    },
    {},
  );
  return { htmlUrl: commentHtmlUrl(result) };
}
