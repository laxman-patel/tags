import { formatApprovalSummary } from "@tags/core/approval-display";

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

const RISK_LABEL: Record<string, string> = {
  none: "Low risk",
  low: "Low risk",
  medium: "Needs a look",
  high: "High risk",
};

function riskContext(risk?: string): string {
  if (!risk) return "";
  return RISK_LABEL[risk] ?? risk;
}

/** A short, human-readable preview of the most relevant input fields. */
function inputPreviewLines(toolInput: unknown): string[] {
  if (!toolInput || typeof toolInput !== "object" || Array.isArray(toolInput)) return [];
  const entries = Object.entries(toolInput as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 5);
  return entries.map(([key, value]) => {
    let rendered: string;
    if (typeof value === "string") rendered = value;
    else {
      try {
        rendered = JSON.stringify(value);
      } catch {
        rendered = String(value);
      }
    }
    if (rendered.length > 160) rendered = `${rendered.slice(0, 157)}…`;
    return `*${key}:* ${rendered}`;
  });
}

/**
 * A standalone Slack approval card, posted as its own in-thread message so it is
 * never entangled with the streaming run message. Approve/Decline are handled by
 * the interactions endpoint, which resolves the same DB row the dashboard uses —
 * keeping Slack and the web app perfectly in sync.
 */
export function buildApprovalCard(args: ApprovalCardArgs): {
  text: string;
  blocks: SlackBlock[];
} {
  const summary = formatApprovalSummary(args.toolName, args.toolInput);
  const text = `Approval needed — ${summary}`;

  const contextParts: string[] = [];
  if (args.requestedBySlackUserId) contextParts.push(`Requested by <@${args.requestedBySlackUserId}>`);
  const risk = riskContext(args.riskLevel);
  if (risk) contextParts.push(risk);
  if (args.expiresAt) {
    const expiry = new Date(args.expiresAt);
    if (!Number.isNaN(expiry.getTime())) {
      contextParts.push(`Expires <t:${Math.floor(expiry.getTime() / 1000)}:R>`);
    }
  }

  const previewLines = inputPreviewLines(args.toolInput);

  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `:lock: *${summary}*` },
    },
  ];

  if (previewLines.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: previewLines.join("\n") },
    });
  }

  if (contextParts.length > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: contextParts.join("  ·  ") }],
    });
  }

  blocks.push({
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
  });

  if (args.appUrl && args.runId) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `<${args.appUrl.replace(/\/$/, "")}/runs/${args.runId}|Review in Tags dashboard>`,
        },
      ],
    });
  }

  return { text, blocks };
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
  const icon =
    args.decision === "approved" ? ":white_check_mark:" : args.decision === "rejected" ? ":no_entry:" : ":hourglass:";
  const verb =
    args.decision === "approved" ? "Approved" : args.decision === "rejected" ? "Declined" : "Expired";
  const text = `${verb} — ${summary}`;

  let by = "";
  if (args.decision === "expired") {
    by = "No response in time";
  } else if (args.actorSlackUserId) {
    by = `by <@${args.actorSlackUserId}>`;
  } else if (args.source === "dashboard") {
    by = "from the Tags dashboard";
  }

  return {
    text,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `${icon} *${verb}* — ${summary}` },
      },
      ...(by
        ? [{ type: "context", elements: [{ type: "mrkdwn", text: by }] }]
        : []),
    ],
  };
}
