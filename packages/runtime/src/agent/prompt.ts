import type { ActiveSpaceConfig } from "@tags/core/spaces";
import type { ModelMessage } from "ai";

export function buildSystemPrompt(
  instructions: string,
  spaceName: string,
): string {
  return `${instructions}

# Runtime context
- Space: #${spaceName}
- Current time: ${new Date().toISOString()}`;
}

/** Flatten thread context into a single opencode run prompt. */
export function buildOpencodePrompt(
  instructions: string,
  spaceName: string,
  messages: ModelMessage[],
): string {
  const system = buildSystemPrompt(instructions, spaceName);
  const thread = messages
    .map((message) => {
      const body =
        typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content);
      return `[${message.role}]\n${body}`;
    })
    .join("\n\n");

  return `${system}

# Task thread
${thread}

Respond to the latest user request in this thread. Be concise and actionable for Slack.`;
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
