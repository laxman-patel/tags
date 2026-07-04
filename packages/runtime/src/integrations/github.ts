const MARKER_PREFIX = "<!-- tags-demo-recording:";

export type GitHubPrRef = {
  owner: string;
  repo: string;
  number: number;
};

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

async function githubJson<T>(
  token: string,
  path: string,
  options?: {
    method?: string;
    body?: unknown;
  },
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    method: options?.method ?? "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`GitHub API ${response.status}: ${detail || response.statusText}`);
  }

  return (await response.json()) as T;
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

export async function upsertDemoRecordingComment(args: {
  token: string;
  prUrl: string;
  runId: string;
  artifactUrl: string;
  appUrl: string;
  slackPermalink?: string;
}): Promise<{ htmlUrl?: string }> {
  const ref = parseGitHubPrUrl(args.prUrl);
  if (!ref) throw new Error(`Unsupported GitHub PR URL: ${args.prUrl}`);

  const comments = await githubJson<Array<{ id: number; body?: string; html_url?: string }>>(
    args.token,
    `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments?per_page=100`,
  );
  const body = buildCommentBody(args);
  const existing = comments.find((comment) => comment.body?.includes(marker(args.runId)));

  if (existing) {
    const updated = await githubJson<{ html_url?: string }>(
      args.token,
      `/repos/${ref.owner}/${ref.repo}/issues/comments/${existing.id}`,
      { method: "PATCH", body: { body } },
    );
    return { htmlUrl: updated.html_url ?? existing.html_url };
  }

  const created = await githubJson<{ html_url?: string }>(
    args.token,
    `/repos/${ref.owner}/${ref.repo}/issues/${ref.number}/comments`,
    { method: "POST", body: { body } },
  );
  return { htmlUrl: created.html_url };
}
