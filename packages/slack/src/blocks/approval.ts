import { formatApprovalSummary } from "@tags/core/approval-display";
import { formatMarkdownForSlack } from "../markdown";

export type SlackBlock = Record<string, unknown>;

export type ApprovalCardArgs = {
  approvalId: string;
  requestId: string;
  toolName: string;
  toolInput?: unknown;
  riskLevel?: string;
  requestedBySlackUserId?: string;
  expiresAt?: string;
  appUrl?: string;
  runId?: string;
};

/**
 * Standalone Slack approval card — one summary line + Approve / Decline.
 * Posted as its own thread message by Inngest (`postApprovalStep`).
 */
export function buildApprovalCard(args: ApprovalCardArgs): {
  text: string;
  blocks: SlackBlock[];
} {
  const summary = formatApprovalSummary(args.toolName, args.toolInput);
  const text = `Approval needed — ${summary}`;

  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: formatMarkdownForSlack(`*Needs approval*\n${summary}`),
        },
      },
      {
        type: "actions",
        block_id: `approval_${args.approvalId}`,
        elements: [
          {
            type: "button",
            action_id: `approval:approve:${args.approvalId}`,
            text: { type: "plain_text", text: "Approve", emoji: true },
            style: "primary",
            value: args.requestId,
          },
          {
            type: "button",
            action_id: `approval:reject:${args.approvalId}`,
            text: { type: "plain_text", text: "Decline", emoji: true },
            style: "danger",
            value: args.requestId,
          },
        ],
      },
    ],
  };
}

export type ApprovalResolutionArgs = {
  decision: "approved" | "rejected" | "expired";
  toolName: string;
  toolInput?: unknown;
  actorSlackUserId?: string;
  source?: "slack" | "dashboard";
};

/** Replaces the interactive card with a settled, non-interactive state. */
export function buildApprovalResolutionCard(args: ApprovalResolutionArgs): {
  text: string;
  blocks: SlackBlock[];
} {
  const summary = formatApprovalSummary(args.toolName, args.toolInput);
  const verb =
    args.decision === "approved" ? "Approved" : args.decision === "rejected" ? "Declined" : "Expired";
  const icon =
    args.decision === "approved"
      ? ":white_check_mark:"
      : args.decision === "rejected"
        ? ":x:"
        : ":hourglass:";

  let line = `${icon} *${verb}* — ${summary}`;
  if (args.decision === "expired") {
    line += " _(timed out)_";
  } else if (args.actorSlackUserId) {
    line += ` by <@${args.actorSlackUserId}>`;
  } else if (args.source === "dashboard") {
    line += " from the dashboard";
  }

  return {
    text: `${verb} — ${summary}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: formatMarkdownForSlack(line) },
      },
    ],
  };
}
