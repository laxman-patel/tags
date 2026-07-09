import type { DemoRecipe, DemoStep, TagsRunOutput } from "./types";

const GITHUB_PR_URL_PATTERN = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/i;

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalPositiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function parseDemoStep(value: unknown): DemoStep | null {
  if (!isStringRecord(value)) return null;
  const type = value.type;
  switch (type) {
    case "navigate": {
      const url = optionalString(value.url);
      return url ? { type, url } : null;
    }
    case "click": {
      const selector = optionalString(value.selector);
      return selector ? { type, selector } : null;
    }
    case "fill": {
      const selector = optionalString(value.selector);
      const fillValue = typeof value.value === "string" ? value.value : undefined;
      return selector && fillValue !== undefined ? { type, selector, value: fillValue } : null;
    }
    case "press": {
      const key = optionalString(value.key);
      return key ? { type, key } : null;
    }
    case "waitForSelector": {
      const selector = optionalString(value.selector);
      return selector
        ? { type, selector, timeoutMs: optionalPositiveInt(value.timeoutMs) }
        : null;
    }
    case "waitForText": {
      const text = optionalString(value.text);
      return text ? { type, text, timeoutMs: optionalPositiveInt(value.timeoutMs) } : null;
    }
    case "waitMs": {
      const ms = optionalPositiveInt(value.ms);
      return ms ? { type, ms } : null;
    }
    case "assertText": {
      const text = optionalString(value.text);
      return text ? { type, text } : null;
    }
    default:
      return null;
  }
}

function parseDemoRecipe(value: unknown): DemoRecipe | undefined {
  if (!isStringRecord(value)) return undefined;
  const kind = value.kind;
  if (kind === "none") {
    return { kind, reason: optionalString(value.reason) ?? "No demo available" };
  }
  if (kind === "terminal") {
    const command = optionalString(value.command);
    if (!command) return undefined;
    return { kind, command, repoSubdir: optionalString(value.repoSubdir) };
  }
  if (kind === "web") {
    const startCommand = optionalString(value.startCommand);
    const readyUrl = optionalString(value.readyUrl);
    const steps = Array.isArray(value.steps)
      ? value.steps.map(parseDemoStep).filter((step): step is DemoStep => Boolean(step))
      : [];
    if (!startCommand || !readyUrl || steps.length === 0) return undefined;
    return {
      kind,
      startCommand,
      readyUrl,
      steps,
      repoSubdir: optionalString(value.repoSubdir),
      installCommand: optionalString(value.installCommand),
      skipInstall: value.skipInstall === true ? true : undefined,
      readyTimeoutMs: optionalPositiveInt(value.readyTimeoutMs),
      successText: optionalString(value.successText),
    };
  }
  return undefined;
}

export function parseTagsRunOutput(value: unknown): TagsRunOutput | undefined {
  if (!isStringRecord(value)) return undefined;
  const parsed: TagsRunOutput = {};
  const prUrl = optionalString(value.prUrl);
  const repoUrl = optionalString(value.repoUrl);
  const branch = optionalString(value.branch);
  const commitSha = optionalString(value.commitSha);
  const demo = parseDemoRecipe(value.demo);

  if (prUrl) parsed.prUrl = prUrl;
  if (repoUrl) parsed.repoUrl = repoUrl;
  if (branch) parsed.branch = branch;
  if (commitSha) parsed.commitSha = commitSha;
  if (demo) parsed.demo = demo;

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
