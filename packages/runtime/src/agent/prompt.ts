import type { ActiveSpaceConfig } from "@tags/core/spaces";

export function buildSystemPrompt(
  instructions: string,
  spaceName: string,
): string {
  return `${instructions}

# Runtime context
- Space: #${spaceName}
- Current time: ${new Date().toISOString()}`;
}

export const REASONING_EFFORTS = [
  "provider-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/**
 * Maps a Space's stored reasoning setting onto AI SDK 7's provider-agnostic
 * top-level `reasoning` effort option. Unknown values fall back to the
 * provider default rather than throwing.
 */
export function reasoningEffortFor(reasoning: string): ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(reasoning)
    ? (reasoning as ReasoningEffort)
    : "provider-default";
}

export type RunConfig = ActiveSpaceConfig & { spaceName: string };
