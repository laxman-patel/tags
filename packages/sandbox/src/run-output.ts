import type { TagsRunOutput } from "./types";

const GITHUB_PR_URL_PATTERN = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/i;

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseTagsRunOutput(value: unknown): TagsRunOutput | undefined {
  if (!isStringRecord(value)) return undefined;
  const parsed: TagsRunOutput = {};
  const prUrl = optionalString(value.prUrl);
  const repoUrl = optionalString(value.repoUrl);
  const branch = optionalString(value.branch);
  const commitSha = optionalString(value.commitSha);

  if (prUrl) parsed.prUrl = prUrl;
  if (repoUrl) parsed.repoUrl = repoUrl;
  if (branch) parsed.branch = branch;
  if (commitSha) parsed.commitSha = commitSha;

  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

export function parseTagsRunOutputJson(json: string): TagsRunOutput | undefined {
  try {
    return parseTagsRunOutput(JSON.parse(json));
  } catch {
    return undefined;
  }
}

export function extractGitHubPrUrl(text: string): string | undefined {
  return text.match(GITHUB_PR_URL_PATTERN)?.[0];
}

/** Normalize a git remote URL to https://github.com/owner/repo (no .git). */
export function normalizeGitHubRepoUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}`;

  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withScheme);
    if (!/^(www\.)?github\.com$/i.test(url.hostname)) return undefined;
    const parts = url.pathname.replace(/\.git$/i, "").split("/").filter(Boolean);
    if (parts.length < 2) return undefined;
    return `https://github.com/${parts[0]}/${parts[1]}`;
  } catch {
    return undefined;
  }
}

/**
 * Merge sparse run-output fields. Later sources only fill missing keys
 * (file beats git harvest beats text scrape).
 */
export function mergeTagsRunOutput(
  ...parts: Array<TagsRunOutput | undefined>
): TagsRunOutput | undefined {
  const merged: TagsRunOutput = {};
  for (const part of parts) {
    if (!part) continue;
    if (!merged.prUrl && part.prUrl) merged.prUrl = part.prUrl;
    if (!merged.repoUrl && part.repoUrl) merged.repoUrl = part.repoUrl;
    if (!merged.branch && part.branch) merged.branch = part.branch;
    if (!merged.commitSha && part.commitSha) merged.commitSha = part.commitSha;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}
