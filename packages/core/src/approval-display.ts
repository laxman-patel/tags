type JsonRecord = Record<string, unknown>;

const APP_LABELS: Record<string, string> = {
  gmail: "Gmail",
  github: "GitHub",
  slack: "Slack",
  linear: "Linear",
  notion: "Notion",
  googlecalendar: "Google Calendar",
  googledrive: "Google Drive",
  composio: "Composio",
};

function asRecord(value: unknown): JsonRecord | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function pickString(input: JsonRecord | null, keys: string[]): string | null {
  if (!input) return null;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function truncate(value: string, max = 80): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function quoted(value: string): string {
  return `"${truncate(value)}"`;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function appFromSlug(slug: string): string {
  const head = slug.split("_")[0]?.toLowerCase() ?? slug.toLowerCase();
  return APP_LABELS[head] ?? titleCase(head);
}

function uniqueAppsFromSlugs(slugs: string[]): string[] {
  const apps = slugs.map((slug) => slug.split("_")[0]?.toLowerCase() ?? slug.toLowerCase());
  return [...new Set(apps.filter(Boolean))];
}

function humanizeIdentifier(value: string): string {
  const cleaned = value
    .replace(/^composio\./i, "")
    .replace(/^[A-Z]+_/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return titleCase(cleaned || value);
}

function summarizeComposioTool(bare: string, input: JsonRecord | null): string | null {
  if (bare === "COMPOSIO_GET_TOOL_SCHEMAS") {
    const slugs = asStringArray(input?.tool_slugs);
    if (slugs.length === 0) return "Connect an external app";
    const apps = uniqueAppsFromSlugs(slugs);
    if (apps.length === 1) return `Connect to ${appFromSlug(slugs[0] ?? apps[0] ?? "app")}`;
    return `Connect to ${apps.map(appFromSlug).join(" & ")}`;
  }

  const upper = bare.toUpperCase();

  if (upper.includes("LINEAR")) {
    const title = pickString(input, ["title", "name", "issue_title"]);
    if (upper.includes("CREATE") && upper.includes("ISSUE")) {
      return title ? `Create Linear issue ${quoted(title)}` : "Create a Linear issue";
    }
    if (upper.includes("UPDATE") || upper.includes("COMMENT")) {
      return title ? `Update Linear issue ${quoted(title)}` : "Update a Linear issue";
    }
    return "Use Linear";
  }

  if (upper.includes("GMAIL") || upper.includes("EMAIL")) {
    const to = pickString(input, ["to", "recipient", "recipient_email", "email"]);
    const subject = pickString(input, ["subject", "title"]);
    if (upper.includes("SEND") || upper.includes("DRAFT") || upper.includes("REPLY")) {
      if (to && subject) return `Send email to ${to}: ${quoted(subject)}`;
      if (to) return `Send an email to ${to}`;
      if (subject) return `Send an email: ${quoted(subject)}`;
      return "Send an email";
    }
    if (upper.includes("FETCH") || upper.includes("LIST") || upper.includes("GET")) {
      return "Read your email";
    }
    return "Use Gmail";
  }

  if (upper.includes("GITHUB")) {
    const repo =
      pickString(input, ["repo", "repository", "full_name"]) ??
      ([pickString(input, ["owner"]), pickString(input, ["repo"])].filter(Boolean).join("/") || null);
    const title = pickString(input, ["title", "name", "path"]);
    if (upper.includes("PULL_REQUEST") || upper.includes("CREATE_A_PULL_REQUEST")) {
      return title
        ? `Open a pull request${repo ? ` in ${repo}` : ""}: ${quoted(title)}`
        : `Open a pull request${repo ? ` in ${repo}` : ""}`;
    }
    if (upper.includes("CREATE") || upper.includes("MERGE") || upper.includes("UPDATE")) {
      if (title && repo) return `Change ${repo}: ${quoted(title)}`;
      if (repo) return `Make changes on GitHub (${repo})`;
      return "Make changes on GitHub";
    }
    return repo ? `Read from GitHub (${repo})` : "Read from GitHub";
  }

  if (upper.includes("SLACK")) {
    if (upper.includes("POST") || upper.includes("SEND")) return "Post to Slack";
    return "Read from Slack";
  }

  if (upper.includes("NOTION")) {
    const title = pickString(input, ["title", "name"]);
    if (upper.includes("CREATE")) {
      return title ? `Create Notion page ${quoted(title)}` : "Create a Notion page";
    }
    return "Use Notion";
  }

  if (upper.includes("SEARCH")) return "Search connected apps";

  return null;
}

/**
 * Human-readable one-line summary of what an approval will do.
 */
export function formatApprovalSummary(toolName: string, toolInput?: unknown): string {
  const input = asRecord(toolInput);
  const bare = toolName.replace(/^composio\./i, "");

  const composioSummary = summarizeComposioTool(bare, input);
  if (composioSummary) return composioSummary;

  switch (toolName) {
    case "save_memory": {
      const content = pickString(input, ["content", "text", "memory"]);
      return content ? `Save to Space memory: ${quoted(content)}` : "Save to Space memory";
    }
    case "create_artifact": {
      const title = pickString(input, ["title", "name"]);
      return title ? `Create artifact ${quoted(title)}` : "Create an artifact";
    }
    case "create_schedule": {
      const cron = pickString(input, ["cron", "schedule"]);
      const prompt = pickString(input, ["prompt", "message"]);
      if (cron && prompt) return `Schedule (${cron}): ${quoted(prompt)}`;
      if (cron) return `Create a schedule (${cron})`;
      return "Create a scheduled task";
    }
    case "run_coding_agent":
      return "Run a coding agent";
    case "web_search": {
      const query = pickString(input, ["query", "q", "search"]);
      return query ? `Search the web for ${quoted(query)}` : "Search the web";
    }
    default:
      return humanizeIdentifier(bare || toolName);
  }
}

export function formatApprovalQuestion(toolName: string, toolInput?: unknown): string {
  return formatApprovalSummary(toolName, toolInput);
}
