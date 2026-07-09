import {
  extractGitHubPrUrl,
  mergeTagsRunOutput,
  parseTagsRunOutputJson,
} from "./run-output";
import type { TagsRunOutput } from "./types";

function ownerRepoFromGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    if (!/^(www\.)?github\.com$/i.test(parsed.hostname)) return null;
    const [owner, repo] = parsed.pathname.replace(/\.git$/i, "").split("/").filter(Boolean);
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

/**
 * Build raw.githubusercontent.com URLs to try for `.tags/run-output.json`.
 * Public repos work without auth.
 */
export function buildRunOutputRawUrls(args: {
  repoUrl?: string;
  branch?: string;
  commitSha?: string;
  prUrl?: string;
}): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (url: string) => {
    if (seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };

  const refs: string[] = [];
  if (args.commitSha?.trim()) refs.push(args.commitSha.trim());
  if (args.branch?.trim()) refs.push(args.branch.trim());
  if (refs.length === 0) return urls;

  const targets: Array<{ owner: string; repo: string }> = [];
  if (args.repoUrl) {
    const parts = ownerRepoFromGitHubUrl(args.repoUrl);
    if (parts) targets.push(parts);
  }
  if (args.prUrl) {
    const prMatch = args.prUrl.match(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/\d+/i,
    );
    if (prMatch) {
      targets.push({ owner: prMatch[1]!, repo: prMatch[2]! });
    }
  }

  for (const { owner, repo } of targets) {
    for (const ref of refs) {
      push(
        `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/.tags/run-output.json`,
      );
    }
  }

  return urls;
}

export async function fetchTagsRunOutputFromGitHub(
  args: {
    repoUrl?: string;
    branch?: string;
    commitSha?: string;
    prUrl?: string;
  },
  fetchFn: typeof fetch = fetch,
): Promise<TagsRunOutput | undefined> {
  const urls = buildRunOutputRawUrls(args);
  for (const url of urls) {
    try {
      const response = await fetchFn(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;
      const text = await response.text();
      const parsed = parseTagsRunOutputJson(text);
      if (parsed) return parsed;
    } catch {
      // try next URL
    }
  }
  return undefined;
}

async function fetchPrHeadRef(
  prUrl: string,
  fetchFn: typeof fetch,
): Promise<{ repoUrl: string; branch: string; commitSha?: string } | null> {
  const match = prUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
  if (!match) return null;
  const owner = match[1]!;
  const repo = match[2]!;
  const number = match[3]!;
  try {
    const response = await fetchFn(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "tags-demo-recorder",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      head?: { ref?: string; sha?: string; repo?: { html_url?: string } };
    };
    const branch = body.head?.ref?.trim();
    if (!branch) return null;
    const repoUrl =
      body.head?.repo?.html_url?.replace(/\.git$/i, "") ??
      `https://github.com/${owner}/${repo}`;
    return {
      repoUrl,
      branch,
      ...(body.head?.sha ? { commitSha: body.head.sha } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Enrich sparse sandbox runOutput with PR URLs scraped from the agent reply
 * and/or `.tags/run-output.json` fetched from the PR branch on GitHub.
 *
 * This covers the common failure where the agent commits the recipe to the PR
 * but Tags never saw the file inside the coding sandbox.
 */
export async function resolveDemoRunOutput(args: {
  sandboxOutput?: TagsRunOutput;
  replyText?: string;
  spaceRepoUrl?: string;
  fetchFn?: typeof fetch;
}): Promise<TagsRunOutput | undefined> {
  const fetchFn = args.fetchFn ?? fetch;
  const fromReplyPr = args.replyText ? extractGitHubPrUrl(args.replyText) : undefined;

  let merged = mergeTagsRunOutput(
    args.sandboxOutput,
    fromReplyPr ? { prUrl: fromReplyPr } : undefined,
    args.spaceRepoUrl ? { repoUrl: args.spaceRepoUrl } : undefined,
  );

  if (merged?.demo) return merged;

  // If we only have a PR URL (from the Slack reply), resolve head ref via API.
  if (merged?.prUrl && (!merged.branch || !merged.commitSha)) {
    const head = await fetchPrHeadRef(merged.prUrl, fetchFn);
    if (head) {
      merged = mergeTagsRunOutput(merged, {
        repoUrl: head.repoUrl,
        branch: head.branch,
        commitSha: head.commitSha,
      });
    }
  }

  const fromGitHub = await fetchTagsRunOutputFromGitHub(
    {
      repoUrl: merged?.repoUrl ?? args.spaceRepoUrl,
      branch: merged?.branch,
      commitSha: merged?.commitSha,
      prUrl: merged?.prUrl,
    },
    fetchFn,
  );

  return mergeTagsRunOutput(merged, fromGitHub);
}
