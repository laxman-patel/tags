import { describe, expect, it } from "vitest";
import {
  buildTagsMcpRunToken,
  createTagsMcpServerConfig,
  OPENCODE_MCP_EXCLUDED_TOOLS,
} from "./tags-mcp";

describe("tags MCP server config", () => {
  it("builds a remote MCP config for enabled native tools", () => {
    const token = buildTagsMcpRunToken(
      {
        runId: "run_1",
        organizationId: "org_1",
        workspaceId: "ws_1",
        spaceId: "space_1",
        channelId: "C123",
        threadId: "thread_1",
        actorSlackUserId: "U123",
        enabledTools: ["search_thread", "run_coding_agent"],
      },
      "test-secret",
    );

    expect(token).toBeTruthy();
    const config = createTagsMcpServerConfig({
      appUrl: "https://tags.example.test",
      token: token!,
    });

    expect(config).toMatchObject({
      type: "remote",
      url: "https://tags.example.test/api/mcp/tags",
      enabled: true,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  });

  it("skips MCP when only excluded tools are enabled", () => {
    const token = buildTagsMcpRunToken(
      {
        runId: "run_1",
        organizationId: "org_1",
        workspaceId: "ws_1",
        spaceId: "space_1",
        channelId: "C123",
        threadId: "thread_1",
        actorSlackUserId: "U123",
        enabledTools: [...OPENCODE_MCP_EXCLUDED_TOOLS],
      },
      "test-secret",
    );

    expect(token).toBeNull();
  });

  it("sets a long enough timeout for record_proof", () => {
    const config = createTagsMcpServerConfig({
      appUrl: "https://tags.example.test",
      token: "tok",
    });
    expect(config.timeout).toBeGreaterThanOrEqual(180_000);
  });
});
