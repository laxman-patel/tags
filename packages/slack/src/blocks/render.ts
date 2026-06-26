import type { TagsEvent } from "@tags/core/events";

export type SlackBlock = Record<string, unknown>;

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
    case "tool.finished":
      return [
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `✓ Tool finished: \`${event.toolName}\`` },
          ],
        },
      ];
    case "approval.requested":
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Approval needed before executing this action.",
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
              text: { type: "plain_text", text: "Reject" },
              style: "danger",
              value: event.requestId,
            },
          ],
        },
      ];
    case "question.requested":
      return [
        {
          type: "section",
          text: { type: "mrkdwn", text: "Tags needs your input." },
        },
      ];
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
    case "run.finished":
      return [
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: "_Run complete._" }],
        },
      ];
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
      text: { type: "mrkdwn", text: text },
    },
  ];
}
