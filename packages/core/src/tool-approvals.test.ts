import { describe, expect, it } from "vitest";
import {
  NATIVE_APPROVABLE_TOOLS,
  composioToolApprovalKey,
  isNativeApprovableTool,
  parseToolApprovalKey,
  toolApprovalKey,
} from "./tool-approvals";

describe("toolApprovalKey", () => {
  it("namespaces native and composio keys", () => {
    expect(toolApprovalKey("native", "create_schedule")).toBe("native:create_schedule");
    expect(toolApprovalKey("composio", "github_create_an_issue")).toBe(
      "composio:GITHUB_CREATE_AN_ISSUE",
    );
  });

  it("maps the runtime's gated composio name to the same key", () => {
    expect(composioToolApprovalKey("composio.GITHUB_CREATE_AN_ISSUE")).toBe(
      "composio:GITHUB_CREATE_AN_ISSUE",
    );
    expect(composioToolApprovalKey("GITHUB_CREATE_AN_ISSUE")).toBe(
      "composio:GITHUB_CREATE_AN_ISSUE",
    );
  });
});

describe("parseToolApprovalKey", () => {
  it("accepts known native tools only", () => {
    expect(parseToolApprovalKey("native:create_schedule")).toEqual({
      source: "native",
      name: "create_schedule",
    });
    expect(parseToolApprovalKey("native:search_thread")).toBeNull();
    expect(parseToolApprovalKey("native:does_not_exist")).toBeNull();
  });

  it("accepts composio slugs and rejects malformed keys", () => {
    expect(parseToolApprovalKey("composio:GMAIL_SEND_EMAIL")).toEqual({
      source: "composio",
      name: "GMAIL_SEND_EMAIL",
    });
    expect(parseToolApprovalKey("composio:")).toBeNull();
    expect(parseToolApprovalKey("bogus:THING")).toBeNull();
    expect(parseToolApprovalKey("no-colon")).toBeNull();
    expect(parseToolApprovalKey("composio:has space")).toBeNull();
  });
});

describe("NATIVE_APPROVABLE_TOOLS", () => {
  it("only lists side-effecting built-ins", () => {
    const ids = NATIVE_APPROVABLE_TOOLS.map((tool) => tool.id);
    expect(ids).toContain("save_memory");
    expect(ids).toContain("create_schedule");
    expect(ids).not.toContain("search_thread");
    expect(ids).not.toContain("ask_user");
    expect(ids.every((id) => isNativeApprovableTool(id))).toBe(true);
  });
});
