import { describe, expect, it } from "vitest";
import { resolveToolkitConnectionStatus } from "./composio";

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
