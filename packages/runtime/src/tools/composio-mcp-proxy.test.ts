import { describe, expect, it } from "vitest";
import {
  coerceInputForJsonSchema,
  isReadOnlyComposioActionSlug,
  jsonSchemaToZodRawShape,
} from "./composio-mcp-proxy";

describe("composio-mcp-proxy classification", () => {
  it("treats read-verb action slugs as read-only", () => {
    expect(isReadOnlyComposioActionSlug("GITHUB_GET_A_REPOSITORY")).toBe(true);
    expect(isReadOnlyComposioActionSlug("GMAIL_LIST_MESSAGES")).toBe(true);
    expect(isReadOnlyComposioActionSlug("GITHUB_SEARCH_ISSUES")).toBe(true);
  });

  it("treats mutating action slugs as not read-only", () => {
    expect(isReadOnlyComposioActionSlug("GMAIL_SEND_EMAIL")).toBe(false);
    expect(isReadOnlyComposioActionSlug("GITHUB_CREATE_AN_ISSUE")).toBe(false);
    expect(isReadOnlyComposioActionSlug("GITHUB_DELETE_A_REPOSITORY")).toBe(false);
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
