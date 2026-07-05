import { beforeEach, describe, expect, it, vi } from "vitest";
import { listComposioConnectedAccountStatuses, resolveToolkitConnectionStatus } from "./composio";

const composioMocks = vi.hoisted(() => ({
  connectedAccountsList: vi.fn(),
}));

vi.mock("@composio/core", () => ({
  Composio: vi.fn(function Composio() {
    return {
      connectedAccounts: {
        list: composioMocks.connectedAccountsList,
      },
    };
  }),
}));

beforeEach(() => {
  composioMocks.connectedAccountsList.mockReset();
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
