import type { TagsEvent } from "@tags/core/events";
import { formatApprovalSummary } from "@tags/core/approval-display";
import type { UICard } from "@tags/core/ui-cards";
import { formatUiCardPreview } from "@tags/core/ui-cards";
import { formatMarkdownForSlack } from "../markdown";

export type SlackBlock = Record<string, unknown>;

function renderUiCardBlocks(card: UICard): SlackBlock[] {
  switch (card.kind) {
    case "artifact":
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: card.url
              ? `📎 *${card.title}* (${card.artifactKind})\n<${card.url}|Open artifact>`
              : `📎 *${card.title}* (${card.artifactKind})`,
          },
        },
        ...(card.preview
          ? [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `\`\`\`${card.preview.slice(0, 500)}\`\`\``,
                },
              },
            ]
          : []),
      ];
    case "memory-search":
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Memory search:* \`${card.query}\`\n${card.items
              .map((i) => `• [${i.kind}] ${i.content.slice(0, 120)}`)
              .join("\n") || "_No matches_"}`,
          },
        },
      ];
    case "memory-saved":
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `💾 Saved *${card.memoryKind}* memory:\n>${card.content}`,
          },
        },
      ];
    case "thread-search":
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Thread search* — ${card.messageCount} message(s)\n\`\`\`${card.preview.slice(0, 400)}\`\`\``,
          },
        },
      ];
    case "channel-search":
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Channel search* — ${card.messageCount} message(s)\n\`\`\`${card.preview.slice(0, 400)}\`\`\``,
          },
        },
      ];
    case "coding-agent":
      const diffBlock =
        card.gitDiffPreview
          ? `\n*Git diff*\n\`\`\`${card.gitDiffPreview.slice(0, 500)}\`\`\``
          : "";
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Coding agent* — exit \`${card.exitCode}\`\n\`\`\`${card.outputPreview.slice(0, 500)}\`\`\`${diffBlock}`,
          },
        },
      ];
    case "schedule-created":
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📅 *Schedule created* — \`${card.cron}\`\n${card.promptPreview}`,
          },
        },
      ];
    case "generic":
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${card.title}*\n${card.body.slice(0, 1500)}`,
          },
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
          text: { type: "mrkdwn", text: event.text.slice(0, 3000) },
        },
      ];
    case "status":
      return [
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `*${event.label}*${event.detail ? ` — ${event.detail}` : ""}`,
            },
          ],
        },
      ];
    case "tool.started":
      return [
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `🔧 Running tool: \`${event.toolName}\`` },
          ],
        },
      ];
    case "tool.finished": {
      const blocks: SlackBlock[] = [
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `✓ Tool finished: \`${event.toolName}\`` },
          ],
        },
      ];
      if (event.uiCard) {
        blocks.push(...renderUiCardBlocks(event.uiCard));
      } else {
        const preview = formatOutputPreview(event.outputPreview);
        if (preview) {
          blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: `\`\`\`${preview}\`\`\`` },
          });
        }
      }
      return blocks;
    }
    case "approval.requested": {
      const summary = formatApprovalSummary(
        event.toolName ?? "",
        event.inputPreview ?? event.requestText,
      );
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔐 *${summary}*\n_Approve or Decline here, or resolve it from the Tags dashboard._`,
          },
        },
        {
          type: "actions",
          block_id: `approval_${event.approvalId}`,
          elements: [
            {
              type: "button",
              action_id: `approval:approve:${event.approvalId}`,
              text: { type: "plain_text", text: "Approve" },
              style: "primary",
              value: event.requestId,
            },
            {
              type: "button",
              action_id: `approval:reject:${event.approvalId}`,
              text: { type: "plain_text", text: "Decline" },
              style: "danger",
              value: event.requestId,
            },
          ],
        },
      ];
    }
    case "question.requested": {
      const detailLines: string[] = [];
      if (event.expiresAt) {
        const expiry = new Date(event.expiresAt);
        detailLines.push(`*Expires:* <t:${Math.floor(expiry.getTime() / 1000)}:R>`);
      }
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `❓ *Tags needs your input:*\n${event.questionText ?? "Please answer the question."}${detailLines.length > 0 ? `\n${detailLines.join("\n")}` : ""}`,
          },
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
          text: {
            type: "mrkdwn",
            text: `📎 Artifact: <${event.artifactUrl}|${event.artifactTitle}>`,
          },
        },
      ];
    case "recording.started":
      return [
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🎥 Recording demo${event.demoKind ? ` (${event.demoKind})` : ""}${event.prUrl ? ` for <${event.prUrl}|PR>` : ""}`,
            },
          ],
        },
      ];
    case "recording.finished":
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🎥 Demo recording: <${event.artifactUrl}|watch video>${event.prUrl ? `\nPR: <${event.prUrl}|open>` : ""}`,
          },
        },
      ];
    case "recording.failed":
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `⚠️ Demo recording failed${event.prUrl ? ` for <${event.prUrl}|PR>` : ""}: ${event.error}`,
          },
        },
      ];
    case "run.finished":
      // The final reply itself is the completion signal; no footer noise.
      return [];
    case "run.failed":
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `❌ Run failed: ${event.error}`,
          },
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
