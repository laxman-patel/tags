import { describe, expect, it } from "vitest";
import {
  coerceInputForJsonSchema,
  isAutoApprovedComposioTool,
  isReadOnlyTool,
  jsonSchemaToZodRawShape,
} from "./composio-mcp-proxy";

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

  it("auto-approves Composio internal orchestration tools", () => {
    expect(isAutoApprovedComposioTool({ name: "multi_execute", annotations: {} })).toBe(true);
    expect(isAutoApprovedComposioTool({ name: "MULTI_EXECUTE", annotations: {} })).toBe(true);
    expect(isAutoApprovedComposioTool({ name: "COMPOSIO_MANAGE_CONNECTIONS", annotations: {} })).toBe(true);
  });

  it("does not auto-approve app write tools without readOnlyHint", () => {
    expect(isAutoApprovedComposioTool({ name: "GMAIL_SEND_EMAIL", annotations: {} })).toBe(false);
  });

  it("preserves basic JSON schema types for MCP tool inputs", () => {
    const shape = jsonSchemaToZodRawShape({
      type: "object",
      required: ["toolkits"],
      properties: {
        toolkits: { type: "array", items: { type: "string" } },
        reinitiate_all: { type: "boolean" },
      },
    });

    const toolkits = shape.toolkits;
    const reinitiateAll = shape.reinitiate_all;
    expect(toolkits).toBeDefined();
    expect(reinitiateAll).toBeDefined();
    expect(toolkits?.safeParse(["gmail"]).success).toBe(true);
    expect(toolkits?.safeParse("gmail").success).toBe(false);
    expect(reinitiateAll?.safeParse(false).success).toBe(true);
    expect(reinitiateAll?.safeParse("false").success).toBe(false);
  });

  it("coerces stringified Composio connection arguments from schema", () => {
    expect(
      coerceInputForJsonSchema(
        { toolkits: "gmail", reinitiate_all: "false" },
        {
          type: "object",
          properties: {
            toolkits: { type: "array", items: { type: "string" } },
            reinitiate_all: { type: "boolean" },
          },
        },
      ),
    ).toEqual({ toolkits: ["gmail"], reinitiate_all: false });
  });
});
