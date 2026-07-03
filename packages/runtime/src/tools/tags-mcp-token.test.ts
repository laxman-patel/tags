import { describe, expect, it } from "vitest";
import {
  createTagsMcpRunToken,
  verifyTagsMcpRunToken,
} from "./tags-mcp-token";

describe("tags MCP run tokens", () => {
  it("round-trips valid run claims", () => {
    const token = createTagsMcpRunToken(
      {
        runId: "run_1",
        organizationId: "org_1",
        workspaceId: "ws_1",
        spaceId: "space_1",
        channelId: "C123",
        threadId: "thread_1",
        actorSlackUserId: "U123",
        enabledTools: ["search_thread"],
      },
      "test-secret",
      60_000,
    );

    const claims = verifyTagsMcpRunToken(token, "test-secret");
    expect(claims).toMatchObject({
      runId: "run_1",
      organizationId: "org_1",
      workspaceId: "ws_1",
      spaceId: "space_1",
      threadId: "thread_1",
      actorSlackUserId: "U123",
      enabledTools: ["search_thread"],
    });
  });

  it("rejects tampered tokens", () => {
    const token = createTagsMcpRunToken(
      {
        runId: "run_1",
        organizationId: "org_1",
        workspaceId: "ws_1",
        spaceId: "space_1",
        channelId: "C123",
        threadId: "thread_1",
        actorSlackUserId: "U123",
        enabledTools: ["search_thread"],
      },
      "test-secret",
    );

    expect(verifyTagsMcpRunToken(`${token}x`, "test-secret")).toBeNull();
    expect(verifyTagsMcpRunToken(token, "wrong-secret")).toBeNull();
  });
});
