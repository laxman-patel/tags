import { describe, expect, it } from "vitest";
import { isReadOnlyTool } from "./composio-mcp-proxy";

describe("composio-mcp-proxy classification", () => {
  it("treats readOnlyHint:true as read-only", () => {
    expect(isReadOnlyTool({ annotations: { readOnlyHint: true } })).toBe(true);
  });

  it("treats readOnlyHint:false as write", () => {
    expect(isReadOnlyTool({ annotations: { readOnlyHint: false } })).toBe(false);
  });

  it("treats missing annotations as write (safe default)", () => {
    expect(isReadOnlyTool({})).toBe(false);
    expect(isReadOnlyTool({ annotations: {} })).toBe(false);
    expect(isReadOnlyTool({ annotations: { destructiveHint: true } })).toBe(false);
  });

  it("treats missing readOnlyHint as write (safe default)", () => {
    expect(
      isReadOnlyTool({ annotations: { idempotentHint: true, openWorldHint: false } }),
    ).toBe(false);
  });
});
