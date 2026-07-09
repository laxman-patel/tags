import type { TagsEvent } from "@tags/core/events";
import { formatApprovalSummary } from "@tags/core/approval-display";
import type { UICard } from "@tags/core/ui-cards";
import { formatUiCardPreview } from "@tags/core/ui-cards";
import { formatMarkdownForSlack } from "../markdown";

export type SlackBlock = Record<string, unknown>;

function mrkdwn(text: string): { type: "mrkdwn"; text: string } {
  return { type: "mrkdwn", text: formatMarkdownForSlack(text) };
}

function renderUiCardBlocks(card: UICard): SlackBlock[] {
  switch (card.kind) {
    case "artifact":
      return [
        {
          type: "section",
          text: mrkdwn(
            card.url
              ? `📎 *${card.title}* (${card.artifactKind})\n<${card.url}|Open artifact>`
              : `📎 *${card.title}* (${card.artifactKind})`,
          ),
        },
        ...(card.preview
          ? [
              {
                type: "section",
                text: mrkdwn(`\`\`\`${card.preview.slice(0, 500)}\`\`\``),
              },
            ]
          : []),
      ];
    case "memory-search":
      return [
        {
          type: "section",
          text: mrkdwn(
            `*Memory search:* \`${card.query}\`\n${
              card.items.map((i) => `• [${i.kind}] ${i.content.slice(0, 120)}`).join("\n") ||
              "_No matches_"
            }`,
          ),
        },
      ];
    case "memory-saved":
      return [
        {
          type: "section",
          text: mrkdwn(`💾 Saved *${card.memoryKind}* memory:\n>${card.content}`),
        },
      ];
    case "thread-search":
      return [
        {
          type: "section",
          text: mrkdwn(
            `*Thread search* — ${card.messageCount} message(s)\n\`\`\`${card.preview.slice(0, 400)}\`\`\``,
          ),
        },
      ];
    case "channel-search":
      return [
        {
          type: "section",
          text: mrkdwn(
            `*Channel search* — ${card.messageCount} message(s)\n\`\`\`${card.preview.slice(0, 400)}\`\`\``,
          ),
        },
      ];
    case "coding-agent": {
      const diffBlock = card.gitDiffPreview
        ? `\n*Git diff*\n\`\`\`${card.gitDiffPreview.slice(0, 500)}\`\`\``
        : "";
      return [
        {
          type: "section",
          text: mrkdwn(
            `*Coding agent* — exit \`${card.exitCode}\`\n\`\`\`${card.outputPreview.slice(0, 500)}\`\`\`${diffBlock}`,
          ),
        },
      ];
    }
    case "schedule-created":
      return [
        {
          type: "section",
          text: mrkdwn(`📅 *Schedule created* — \`${card.cron}\`\n${card.promptPreview}`),
        },
      ];
    case "generic":
      return [
        {
          type: "section",
          text: mrkdwn(`*${card.title}*\n${card.body.slice(0, 1500)}`),
        },
      ];
    default: {
      const _exhaustive: never = card;
      return _exhaustive;
    }
  }
}

function formatOutputPreview(output: unknown): string {
  if (output == null) return "";
  if (typeof output === "string") return output.slice(0, 300);
  try {
    return JSON.stringify(output, null, 0).slice(0, 300);
  } catch {
    return String(output).slice(0, 300);
  }
}

export function renderSlackBlocks(event: TagsEvent): SlackBlock[] {
  switch (event.type) {
    case "text.delta":
      return [
        {
          type: "section",
          text: mrkdwn(event.text.slice(0, 3000)),
        },
      ];
    case "status":
      return [
        {
          type: "context",
          elements: [
            mrkdwn(`*${event.label}*${event.detail ? ` — ${event.detail}` : ""}`),
          ],
        },
      ];
    case "tool.started":
      return [
        {
          type: "context",
          elements: [mrkdwn(`Running \`${event.toolName}\``)],
        },
      ];
    case "tool.progress":
      return [
        {
          type: "context",
          elements: [mrkdwn(`_${event.step}_`)],
        },
      ];
    case "tool.finished": {
      const blocks: SlackBlock[] = [
        {
          type: "context",
          elements: [mrkdwn(`Finished \`${event.toolName}\``)],
        },
      ];
      if (event.uiCard) {
        blocks.push(...renderUiCardBlocks(event.uiCard));
      } else {
        const preview = formatOutputPreview(event.outputPreview);
        if (preview) {
          blocks.push({
            type: "section",
            text: mrkdwn(`\`\`\`${preview}\`\`\``),
          });
        }
      }
      return blocks;
    }
    case "approval.requested": {
      // Buttons live on the standalone card (`buildApprovalCard`). Timeline /
      // classic fallback only shows a short wait note.
      const summary = formatApprovalSummary(
        event.toolName ?? "",
        event.inputPreview ?? event.requestText,
      );
      return [
        {
          type: "context",
          elements: [mrkdwn(`Waiting for approval — *${summary}*`)],
        },
      ];
    }
    case "question.requested": {
      return [
        {
          type: "section",
          text: mrkdwn(
            `*Tags needs your input*\n${event.questionText ?? "Please answer the question."}`,
          ),
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              action_id: `question:answer:${event.questionId}`,
              text: { type: "plain_text", text: "Answer" },
              style: "primary",
              value: event.requestId,
            },
          ],
        },
      ];
    }
    case "artifact.created":
      return [
        {
          type: "section",
          text: mrkdwn(`📎 Artifact: <${event.artifactUrl}|${event.artifactTitle}>`),
        },
      ];
    case "recording.started":
      return [
        {
          type: "context",
          elements: [
            mrkdwn(
              `🎥 Recording demo${event.demoKind ? ` (${event.demoKind})` : ""}${event.prUrl ? ` for <${event.prUrl}|PR>` : ""}`,
            ),
          ],
        },
      ];
    case "recording.finished":
      return [
        {
          type: "section",
          text: mrkdwn(
            `🎥 Demo recording: <${event.artifactUrl}|watch video>${event.prUrl ? `\nPR: <${event.prUrl}|open>` : ""}`,
          ),
        },
      ];
    case "recording.failed":
      return [
        {
          type: "section",
          text: mrkdwn(
            `⚠️ Demo recording failed${event.prUrl ? ` for <${event.prUrl}|PR>` : ""}: ${event.error}`,
          ),
        },
      ];
    case "run.finished":
      // The final reply itself is the completion signal; no footer noise.
      return [];
    case "run.failed":
      return [
        {
          type: "section",
          text: mrkdwn(`❌ Run failed: ${event.error}`),
        },
      ];
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

export { formatUiCardPreview };

export function buildRunLinkBlock(appUrl: string, runId: string): SlackBlock[] {
  return [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<${appUrl}/runs/${runId}|View full run timeline>`,
        },
      ],
    },
  ];
}

export function buildWorkingMessage(text: string): SlackBlock[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: formatMarkdownForSlack(text) },
    },
  ];
}
