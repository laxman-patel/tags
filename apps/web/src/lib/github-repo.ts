export function parseGitHubRepo(
  repoUrl: string | null | undefined,
): { owner: string; repo: string } | null {
  if (!repoUrl) return null;
  const httpsMatch = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?\/?$/);
  if (httpsMatch?.[1] && httpsMatch[2]) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  const sshMatch = repoUrl.match(/^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (sshMatch?.[1] && sshMatch[2]) return { owner: sshMatch[1], repo: sshMatch[2] };
  return null;
}

export function normalizeRepoUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const url of urls) {
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}
