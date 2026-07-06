import { describe, expect, it } from "vitest";
import { formatApprovalSummary } from "./approval-display";

describe("formatApprovalSummary", () => {
  it("summarizes composio schema lookup for Gmail", () => {
    expect(
      formatApprovalSummary("composio.COMPOSIO_GET_TOOL_SCHEMAS", {
        tool_slugs: ["GMAIL_FETCH_EMAILS", "GMAIL_GET_EMAIL"],
      }),
    ).toBe("Connect to Gmail");
  });

  it("summarizes Gmail read actions", () => {
    expect(formatApprovalSummary("composio.GMAIL_FETCH_EMAILS", {})).toBe("Read your email");
  });

  it("summarizes native tools", () => {
    expect(formatApprovalSummary("save_memory", { content: "note" })).toBe("Save to Space memory");
  });

  it("humanizes unknown tool names", () => {
    expect(formatApprovalSummary("composio.LINEAR_CREATE_ISSUE", {})).toBe("Create Issue");
  });
});
