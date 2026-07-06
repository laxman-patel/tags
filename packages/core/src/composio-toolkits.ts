export const GITHUB_TOOLKIT_ID = "github";

export function isGitHubToolkitConnected(
  tools: Array<{ id: string; authState?: string }>,
): boolean {
  return tools.some(
    (tool) => tool.id === GITHUB_TOOLKIT_ID && tool.authState === "connected",
  );
}

export function spaceHasGitHubConnection(args: {
  availableConnections: string[];
  accountStatuses: Record<string, string>;
}): boolean {
  const hasGitHub = args.availableConnections.some(
    (connection) => connection.trim().toLowerCase() === GITHUB_TOOLKIT_ID,
  );
  if (!hasGitHub) return false;

  const status = args.accountStatuses[GITHUB_TOOLKIT_ID]?.trim().toUpperCase() ?? "";
  return status === "ACTIVE" || status === "CONNECTED" || status === "ENABLED";
}
