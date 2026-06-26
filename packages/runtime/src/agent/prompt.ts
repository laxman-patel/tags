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

export function reasoningFor(
  reasoning: string,
): Record<string, unknown> | undefined {
  if (reasoning === "provider-default" || reasoning === "none") {
    return undefined;
  }
  return {
    openai: { reasoningEffort: reasoning },
    anthropic: { thinking: { type: "enabled", budgetTokens: 8000 } },
  };
}

export type RunConfig = ActiveSpaceConfig & { spaceName: string };
