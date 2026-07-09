import { describe, expect, it } from "vitest";
import { buildApprovalCard, buildApprovalResolutionCard } from "./approval";

describe("buildApprovalCard", () => {
  it("renders a short summary with Approve and Decline only", () => {
    const card = buildApprovalCard({
      approvalId: "apr_1",
      requestId: "req_1",
      toolName: "composio.LINEAR_CREATE_ISSUE",
      toolInput: { title: "Broken MCP link" },
      riskLevel: "medium",
      expiresAt: new Date().toISOString(),
      appUrl: "https://tags.example",
      runId: "run_1",
    });

    expect(card.text).toContain("Create Linear issue");
    expect(JSON.stringify(card.blocks)).not.toContain("tool_slugs");
    expect(JSON.stringify(card.blocks)).not.toContain("High risk");
    expect(JSON.stringify(card.blocks)).not.toContain("Review in Tags dashboard");
    expect(JSON.stringify(card.blocks)).toContain("Approve");
    expect(JSON.stringify(card.blocks)).toContain("Decline");
    expect(card.blocks).toHaveLength(2);
  });
});

describe("buildApprovalResolutionCard", () => {
  it("collapses to a single settled line", () => {
    const card = buildApprovalResolutionCard({
      decision: "approved",
      toolName: "composio.LINEAR_CREATE_ISSUE",
      toolInput: { title: "Broken MCP link" },
      actorSlackUserId: "U123",
      source: "slack",
    });

    expect(card.blocks).toHaveLength(1);
    expect(JSON.stringify(card.blocks)).toContain("Approved");
    expect(JSON.stringify(card.blocks)).toContain("<@U123>");
  });
});
