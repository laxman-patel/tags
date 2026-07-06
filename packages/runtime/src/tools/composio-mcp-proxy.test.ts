import { describe, expect, it } from "vitest";
import {
  coerceInputForJsonSchema,
  isComposioInternalTool,
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

  it("treats missing annotations as not read-only", () => {
    expect(isReadOnlyTool({})).toBe(false);
    expect(isReadOnlyTool({ annotations: {} })).toBe(false);
    expect(isReadOnlyTool({ annotations: { destructiveHint: true } })).toBe(false);
  });

  it("flags Composio internal orchestration tools (always auto-run)", () => {
    expect(isComposioInternalTool("multi_execute")).toBe(true);
    expect(isComposioInternalTool("MULTI_EXECUTE")).toBe(true);
    expect(isComposioInternalTool("composio_manage_connections")).toBe(true);
  });

  it("does not flag app tools as internal", () => {
    expect(isComposioInternalTool("GMAIL_SEND_EMAIL")).toBe(false);
    expect(isComposioInternalTool("GITHUB_CREATE_AN_ISSUE")).toBe(false);
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
