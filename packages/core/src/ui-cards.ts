/** Structured cards shared by Slack Block Kit and web React renderers. */
export type UICard =
  | {
      kind: "artifact";
      title: string;
      artifactKind: string;
      url?: string;
      preview?: string;
    }
  | {
      kind: "memory-search";
      query: string;
      items: Array<{ kind: string; content: string }>;
    }
  | {
      kind: "memory-saved";
      memoryKind: string;
      content: string;
    }
  | {
      kind: "thread-search";
      messageCount: number;
      preview: string;
    }
  | {
      kind: "channel-search";
      messageCount: number;
      preview: string;
    }
  | {
      kind: "coding-agent";
      exitCode: number;
      outputPreview: string;
      gitDiffPreview?: string;
    }
  | {
      kind: "schedule-created";
      cron: string;
      promptPreview: string;
    }
  | {
      kind: "generic";
      title: string;
      body: string;
    };

export function truncateForPreview(text: string, max = 400): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function formatToolResultForUser(output: unknown, uiCard?: UICard): string {
  if (uiCard) return formatUiCardPreview(uiCard);
  if (typeof output === "string") return truncateForPreview(output);
  try {
    return truncateForPreview(JSON.stringify(output));
  } catch {
    return truncateForPreview(String(output));
  }
}

export function formatUiCardPreview(card: UICard): string {
  switch (card.kind) {
    case "artifact":
      return card.preview ?? card.title;
    case "memory-search":
      return card.items.map((i) => `[${i.kind}] ${i.content}`).join("\n") || "No matches";
    case "memory-saved":
      return card.content;
    case "thread-search":
      return card.preview;
    case "channel-search":
      return card.preview;
    case "coding-agent":
      return card.gitDiffPreview
        ? `${card.outputPreview}\n\n--- git diff ---\n${card.gitDiffPreview}`
        : card.outputPreview;
    case "schedule-created":
      return `Schedule created: \`${card.cron}\` — ${card.promptPreview}`;
    case "generic":
      return card.body;
    default: {
      const _exhaustive: never = card;
      return _exhaustive;
    }
  }
}
