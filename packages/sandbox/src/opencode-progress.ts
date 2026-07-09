/**
 * Turn raw opencode stream lines into a short human step for Slack.
 * Returns null when the line shouldn't update the progress subtitle.
 */

const MAX_STEP = 72;

function truncate(value: string, max = MAX_STEP): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(input: Record<string, unknown> | null, keys: string[]): string | null {
  if (!input) return null;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function commandFromInput(input: Record<string, unknown> | null): string {
  return (
    pickString(input, ["command", "cmd", "script", "bash", "code", "query", "path", "file_path", "filePath"]) ??
    ""
  ).toLowerCase();
}

function summarizeBash(command: string): string {
  if (!command) return "Running a command";
  if (/\bgit\s+clone\b/.test(command) || /\bclone\b/.test(command)) return "Cloning the repo";
  if (/\bgit\s+push\b/.test(command)) return "Pushing the branch";
  if (/\bgit\s+commit\b/.test(command)) return "Committing changes";
  if (/\bgit\s+checkout\b|\bgit\s+switch\b|\bgit\s+branch\b/.test(command)) return "Creating a branch";
  if (/\bgh\s+pr\b|\bpull.?request\b|hub\s+pull-request\b/.test(command)) return "Opening a pull request";
  if (/\bnpm\b|\bpnpm\b|\bbun\b|\byarn\b/.test(command) && /\b(install|i|ci)\b/.test(command)) {
    return "Installing dependencies";
  }
  if (/\b(typecheck|tsc|lint|test|vitest|playwright)\b/.test(command)) return "Verifying the change";
  if (/\bcurl\b|\bwget\b/.test(command)) return "Checking the running app";
  return "Running a command";
}

function summarizeComposio(tool: string): string {
  const upper = tool.toUpperCase();
  if (upper.includes("PULL_REQUEST") || upper.includes("CREATE_A_PULL_REQUEST")) {
    return "Opening a pull request";
  }
  if (upper.includes("CREATE_OR_UPDATE_FILE") || upper.includes("PUSH_FILES")) {
    return "Pushing the fix";
  }
  if (upper.includes("LINEAR") && upper.includes("ISSUE")) return "Filing a Linear issue";
  if (upper.includes("GMAIL") || upper.includes("EMAIL")) return "Working in Gmail";
  if (upper.includes("GITHUB")) return "Working on GitHub";
  return "Using a connected app";
}

function summarizeTool(toolName: string, input: Record<string, unknown> | null): string | null {
  const tool = toolName.replace(/^composio[._]/i, "");
  const lower = tool.toLowerCase();
  const command = commandFromInput(input);

  if (lower === "bash" || lower === "shell" || lower === "run_terminal_cmd") {
    return summarizeBash(command);
  }
  if (lower === "read" || lower === "read_file") return "Reading the code";
  if (lower === "edit" || lower === "write" || lower === "apply_patch" || lower === "str_replace") {
    return "Making the fix";
  }
  if (lower === "grep" || lower === "glob" || lower === "search" || lower === "semantic_search") {
    return "Searching the codebase";
  }
  if (lower === "todowrite" || lower === "todo" || lower === "task") return "Planning next steps";

  // Composio / toolkit tools often look like GITHUB_CREATE_A_PULL_REQUEST.
  if (
    tool.includes("_") &&
    /^[A-Z0-9_]+$/.test(tool)
  ) {
    return summarizeComposio(tool);
  }
  if (
    lower.includes("github") ||
    lower.includes("linear") ||
    lower.includes("gmail") ||
    lower.includes("notion") ||
    lower.startsWith("composio")
  ) {
    return summarizeComposio(tool);
  }
  return null;
}

function summarizeNarration(text: string): string | null {
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.length > 12 && !part.startsWith("✓") && !part.startsWith("✗") && !part.startsWith("❌"));
  if (!line) return null;

  const lower = line.toLowerCase();
  if (/\b(clone|cloning)\b/.test(lower)) return "Cloning the repo";
  if (/\b(investigat|looking into|reproduc|bug|issue)\b/.test(lower)) return "Investigating the bug";
  if (/\b(pull request|open(ing)? a pr|create(ing)? a pr)\b/.test(lower)) return "Opening a pull request";
  if (/\b(push(ing)?|commit(ting)?)\b/.test(lower)) return "Pushing the change";
  if (/\b(video|screencast|demo recording|record(ing)?)\b/.test(lower)) return "Preparing the demo recording";
  if (/\b(fix|patch|edit|change)\b/.test(lower)) return "Making the fix";
  if (/\b(read|check|inspect|look)\b/.test(lower)) return "Reading the code";

  // Avoid dumping long agent prose into the subtitle.
  if (line.length > 90) return truncate(line, 56);
  return truncate(line);
}

type OpencodeProgressEvent = {
  type?: string;
  part?: {
    text?: string;
    tool?: string;
    state?: {
      status?: string;
      error?: string;
      input?: unknown;
      args?: unknown;
    };
    input?: unknown;
    args?: unknown;
  };
};

/**
 * Map one opencode stdout line (JSON event or plain text) to a short Slack step.
 */
export function summarizeOpencodeProgressLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const event = JSON.parse(trimmed) as OpencodeProgressEvent;
    if (event.type === "tool_use" && event.part?.tool) {
      const status = event.part.state?.status;
      if (status === "error") {
        return truncate(`Hit a snag in ${event.part.tool}`);
      }
      // Prefer in-progress / completed tool steps; skip unknown statuses that are noisy.
      if (status && status !== "pending" && status !== "running" && status !== "completed") {
        return null;
      }
      const input = asRecord(event.part.state?.input ?? event.part.state?.args ?? event.part.input ?? event.part.args);
      return summarizeTool(event.part.tool, input);
    }
    if (event.type === "text" && event.part?.text) {
      return summarizeNarration(event.part.text);
    }
    return null;
  } catch {
    // Humanized stream lines from formatJsonLineForStream, e.g. "✓ bash"
    if (/^✓\s+/u.test(trimmed)) {
      const tool = trimmed.replace(/^✓\s+/u, "").trim();
      return summarizeTool(tool, null);
    }
    if (/^✗\s+/u.test(trimmed)) return null;
    return summarizeNarration(trimmed);
  }
}
