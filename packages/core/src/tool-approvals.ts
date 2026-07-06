import { and, eq } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, spaceToolApprovals } from "@tags/db";

export type ToolRiskLevel = "none" | "low" | "medium" | "high";

/**
 * A tool key uniquely identifies an approvable subtool within a Space.
 *
 *   native:<tool_id>        e.g. native:create_schedule
 *   composio:<TOOL_SLUG>    e.g. composio:GITHUB_CREATE_AN_ISSUE
 *
 * Presence of a key in `space_tool_approvals` means that subtool pauses for
 * human approval before it runs. Absence means it runs immediately. The
 * default posture for every Space is "no key set" => nothing needs approval.
 */
export type ToolApprovalSource = "native" | "composio";

export function toolApprovalKey(source: ToolApprovalSource, name: string): string {
  const normalized = source === "composio" ? name.trim().toUpperCase() : name.trim();
  return `${source}:${normalized}`;
}

/** The runtime gate names Composio tools `composio.<SLUG>`; map that to a key. */
export function composioToolApprovalKey(gatedOrRawName: string): string {
  const raw = gatedOrRawName.replace(/^composio\./i, "");
  return toolApprovalKey("composio", raw);
}

export type NativeApprovableTool = {
  id: string;
  /** Human label shown in the approvals UI. */
  label: string;
  description: string;
  risk: ToolRiskLevel;
};

/**
 * Native (built-in) tools that can be placed behind approval. Only
 * side-effecting tools that are actually exposed to the agent are listed —
 * read-only search tools and `ask_user` (an interactive question, not an
 * action) are intentionally excluded, and `run_coding_agent` is never bridged
 * into the opencode sandbox so it cannot be gated there.
 */
export const NATIVE_APPROVABLE_TOOLS: NativeApprovableTool[] = [
  {
    id: "save_memory",
    label: "Save memory",
    description: "Write durable facts to this Space's memory.",
    risk: "low",
  },
  {
    id: "create_artifact",
    label: "Create artifact",
    description: "Create a durable file, report, or rich artifact.",
    risk: "low",
  },
  {
    id: "create_schedule",
    label: "Create schedule",
    description: "Set up a recurring scheduled task for this Space.",
    risk: "high",
  },
];

const nativeApprovableIds = new Set(NATIVE_APPROVABLE_TOOLS.map((tool) => tool.id));

export function isNativeApprovableTool(toolId: string): boolean {
  return nativeApprovableIds.has(toolId);
}

/** Validates a tool key and returns its parts, or null if it is malformed. */
export function parseToolApprovalKey(
  key: string,
): { source: ToolApprovalSource; name: string } | null {
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const source = key.slice(0, idx);
  const name = key.slice(idx + 1).trim();
  if (!name) return null;
  if (source === "native") {
    return isNativeApprovableTool(name) ? { source, name } : null;
  }
  if (source === "composio") {
    // Composio slugs are opaque uppercase identifiers.
    if (!/^[A-Z0-9._-]+$/.test(name)) return null;
    return { source, name };
  }
  return null;
}

/** All approval-required tool keys for a Space, as a fast-lookup Set. */
export async function listApprovalRequiredToolKeys(
  db: Db,
  spaceId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ toolKey: spaceToolApprovals.toolKey })
    .from(spaceToolApprovals)
    .where(eq(spaceToolApprovals.spaceId, spaceId));
  return new Set(rows.map((row) => row.toolKey));
}

export async function listSpaceToolApprovals(db: Db, spaceId: string): Promise<string[]> {
  const rows = await db
    .select({ toolKey: spaceToolApprovals.toolKey })
    .from(spaceToolApprovals)
    .where(eq(spaceToolApprovals.spaceId, spaceId));
  return rows.map((row) => row.toolKey);
}

/** Adds or removes an approval requirement for a single subtool (idempotent). */
export async function setSpaceToolApproval(
  db: Db,
  args: { organizationId: string; spaceId: string; toolKey: string; required: boolean },
): Promise<void> {
  if (args.required) {
    await db
      .insert(spaceToolApprovals)
      .values({
        id: newId(),
        organizationId: args.organizationId,
        spaceId: args.spaceId,
        toolKey: args.toolKey,
      })
      .onConflictDoNothing({
        target: [spaceToolApprovals.spaceId, spaceToolApprovals.toolKey],
      });
    return;
  }

  await db
    .delete(spaceToolApprovals)
    .where(
      and(
        eq(spaceToolApprovals.spaceId, args.spaceId),
        eq(spaceToolApprovals.toolKey, args.toolKey),
      ),
    );
}
