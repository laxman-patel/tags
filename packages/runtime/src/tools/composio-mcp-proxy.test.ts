import { describe, expect, it, vi } from "vitest";
import {
  buildComposioMcpRunToken,
  coerceInputForJsonSchema,
  executeComposioAction,
  isReadOnlyComposioActionSlug,
  jsonSchemaToZodRawShape,
  listComposioMcpToolsForSpace,
  normalizeComposioToolkits,
} from "./composio-mcp-proxy";
import { verifyTagsMcpRunToken } from "./tags-mcp-token";

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

  it("normalizes toolkit ids before creating a run token", () => {
    const token = buildComposioMcpRunToken(
      {
        runId: "run_1",
        organizationId: "org_1",
        workspaceId: "ws_1",
        spaceId: "space_1",
        channelId: "C123",
        threadId: "thread_1",
        actorSlackUserId: "U123",
        enabledTools: [],
        enabledConnections: [" Gmail ", "gmail", "GitHub"],
      },
      "test-secret",
    );

    expect(token).toBeTruthy();
    expect(verifyTagsMcpRunToken(token!, "test-secret")?.enabledConnections).toEqual([
      "gmail",
      "github",
    ]);
  });

  it("skips Composio MCP when no normalized toolkit ids remain", () => {
    const token = buildComposioMcpRunToken(
      {
        runId: "run_1",
        organizationId: "org_1",
        workspaceId: "ws_1",
        spaceId: "space_1",
        channelId: "C123",
        threadId: "thread_1",
        actorSlackUserId: "U123",
        enabledTools: [],
        enabledConnections: [" ", ""],
      },
      "test-secret",
    );

    expect(token).toBeNull();
  });

  it("creates a Space-scoped Composio session before listing raw tools", async () => {
    const tools = [{ slug: "GMAIL_LIST_MESSAGES", name: "List messages" }];
    const composio = {
      create: vi.fn().mockResolvedValue({}),
      tools: {
        getRawComposioTools: vi.fn().mockResolvedValue(tools),
        execute: vi.fn(),
      },
    };

    await expect(
      listComposioMcpToolsForSpace({
        composio,
        spaceId: "space_1",
        toolkits: normalizeComposioToolkits([" Gmail "]),
      }),
    ).resolves.toBe(tools);

    expect(composio.create).toHaveBeenCalledWith("space_1", {
      mcp: true,
      toolkits: ["gmail"],
    });
    expect(composio.tools.getRawComposioTools).toHaveBeenCalledWith({
      toolkits: ["gmail"],
      limit: 500,
    });
    const createCallOrder = composio.create.mock.invocationCallOrder[0];
    const listCallOrder = composio.tools.getRawComposioTools.mock.invocationCallOrder[0];
    expect(createCallOrder).toBeDefined();
    expect(listCallOrder).toBeDefined();
    expect(createCallOrder!).toBeLessThan(listCallOrder!);
  });

  it("executes approved actions by raw slug against the Space entity", async () => {
    const execute = vi.fn().mockResolvedValue({
      successful: true,
      error: null,
      data: { ok: true },
    });

    await expect(
      executeComposioAction(
        {
          create: vi.fn(),
          tools: {
            getRawComposioTools: vi.fn(),
            execute,
          },
        },
        {
          spaceId: "space_1",
          slug: "GITHUB_CREATE_AN_ISSUE",
          input: { owner: "tags", repo: "app" },
        },
      ),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    });

    expect(execute).toHaveBeenCalledWith("GITHUB_CREATE_AN_ISSUE", {
      userId: "space_1",
      arguments: { owner: "tags", repo: "app" },
      dangerouslySkipVersionCheck: true,
    });
  });
});
