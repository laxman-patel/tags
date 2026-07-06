import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listComposioConnectedAccountStatuses,
  listComposioToolkitActions,
  resolveToolkitConnectionStatus,
} from "./composio";

const composioMocks = vi.hoisted(() => ({
  create: vi.fn(),
  connectedAccountsList: vi.fn(),
  getRawComposioTools: vi.fn(),
}));

vi.mock("@composio/core", () => ({
  Composio: vi.fn(function Composio() {
    return {
      create: composioMocks.create,
      connectedAccounts: {
        list: composioMocks.connectedAccountsList,
      },
      tools: {
        getRawComposioTools: composioMocks.getRawComposioTools,
      },
    };
  }),
}));

beforeEach(() => {
  composioMocks.create.mockReset();
  composioMocks.connectedAccountsList.mockReset();
  composioMocks.getRawComposioTools.mockReset();
});

describe("resolveToolkitConnectionStatus", () => {
  it("reports missing API key", () => {
    expect(resolveToolkitConnectionStatus({ hasApiKey: false, enabled: true })).toBe(
      "missing_api_key",
    );
  });

  it("reports available when toolkit is not enabled", () => {
    expect(resolveToolkitConnectionStatus({ hasApiKey: true, enabled: false })).toBe("available");
  });

  it("reports connected for active accounts", () => {
    expect(
      resolveToolkitConnectionStatus({
        hasApiKey: true,
        enabled: true,
        accountStatus: "ACTIVE",
      }),
    ).toBe("connected");
  });

  it("normalizes connected account statuses", () => {
    for (const accountStatus of ["active", " CONNECTED ", "enabled"]) {
      expect(
        resolveToolkitConnectionStatus({
          hasApiKey: true,
          enabled: true,
          accountStatus,
        }),
      ).toBe("connected");
    }
  });

  it("reports needs_auth when enabled but not connected", () => {
    expect(
      resolveToolkitConnectionStatus({
        hasApiKey: true,
        enabled: true,
        accountStatus: "INITIALIZING",
      }),
    ).toBe("needs_auth");
  });
});

describe("listComposioToolkitActions", () => {
  it("creates the Space-scoped session before listing action slugs", async () => {
    composioMocks.create.mockResolvedValue({});
    composioMocks.getRawComposioTools.mockResolvedValue([
      {
        slug: "SLACK_SEND_MESSAGE",
        name: "Send message",
        description: "Send a Slack message",
      },
    ]);

    await expect(
      listComposioToolkitActions({
        apiKey: "composio-key",
        entityId: "space_123",
        toolkit: " Slack ",
      }),
    ).resolves.toEqual([
      {
        slug: "SLACK_SEND_MESSAGE",
        name: "Send message",
        description: "Send a Slack message",
        readOnly: false,
      },
    ]);

    expect(composioMocks.create).toHaveBeenCalledWith("space_123", {
      mcp: true,
      toolkits: ["slack"],
    });
    expect(composioMocks.getRawComposioTools).toHaveBeenCalledWith({
      toolkits: ["slack"],
      limit: 500,
    });
    const createCallOrder = composioMocks.create.mock.invocationCallOrder[0];
    const listCallOrder = composioMocks.getRawComposioTools.mock.invocationCallOrder[0];
    expect(createCallOrder).toBeDefined();
    expect(listCallOrder).toBeDefined();
    expect(createCallOrder!).toBeLessThan(listCallOrder!);
  });
});

describe("listComposioConnectedAccountStatuses", () => {
  it("prefers active accounts when Composio returns multiple rows for a toolkit", async () => {
    composioMocks.connectedAccountsList.mockResolvedValue({
      items: [
        { toolkit: { slug: "github" }, status: "INITIATED", isDisabled: false },
        { toolkit: { slug: "github" }, status: "ACTIVE", isDisabled: false },
        { toolkit: { slug: "linear" }, status: "ACTIVE", isDisabled: true },
      ],
    });

    await expect(
      listComposioConnectedAccountStatuses({ apiKey: "composio-key", entityId: "space_123" }),
    ).resolves.toEqual({
      github: "ACTIVE",
      linear: "INACTIVE",
    });

    expect(composioMocks.connectedAccountsList).toHaveBeenCalledWith({
      userIds: ["space_123"],
      accountType: "ALL",
    });
  });
});
