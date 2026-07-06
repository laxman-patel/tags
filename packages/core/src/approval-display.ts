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
  if (upper.includes("GMAIL") || upper.includes("EMAIL")) {
    if (upper.includes("SEND") || upper.includes("DRAFT") || upper.includes("REPLY")) {
      return "Send an email";
    }
    if (upper.includes("FETCH") || upper.includes("LIST") || upper.includes("GET")) {
      return "Read your email";
    }
    return "Use Gmail";
  }

  if (upper.includes("GITHUB")) {
    if (upper.includes("CREATE") || upper.includes("MERGE") || upper.includes("UPDATE")) {
      return "Make changes on GitHub";
    }
    return "Read from GitHub";
  }

  if (upper.includes("SLACK")) {
    if (upper.includes("POST") || upper.includes("SEND")) return "Post to Slack";
    return "Read from Slack";
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
    case "save_memory":
      return "Save to Space memory";
    case "create_artifact":
      return "Create an artifact";
    case "create_schedule":
      return "Create a scheduled task";
    case "run_coding_agent":
      return "Run a coding agent";
    case "web_search":
      return "Search the web";
    default:
      return humanizeIdentifier(bare || toolName);
  }
}

export function formatApprovalQuestion(toolName: string, toolInput?: unknown): string {
  return formatApprovalSummary(toolName, toolInput);
}
