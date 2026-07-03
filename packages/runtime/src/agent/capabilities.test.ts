import { describe, expect, it } from "vitest";
import {
  buildCapabilitiesReply,
  isCapabilityInventoryQuestion,
} from "./capabilities";

describe("capability inventory replies", () => {
  it("detects the Slack tools and connections verification prompt", () => {
    expect(
      isCapabilityInventoryQuestion("@tags what tools and connections do you have access to?"),
    ).toBe(true);
  });

  it("does not treat ordinary tool design questions as inventory requests", () => {
    expect(isCapabilityInventoryQuestion("@tags what tools should we build next?")).toBe(false);
  });

  it("renders a Tags-facing capability answer from Space config", () => {
    const reply = buildCapabilitiesReply({
      spaceName: "dev",
      enabledTools: ["search_thread", "create_artifact", "run_coding_agent"],
      enabledConnections: ["github", "linear"],
      hasComposioApiKey: true,
    });

    expect(reply).toContain("I'm Tags for the #dev Space");
    expect(reply).toContain("search_thread");
    expect(reply).toContain("run_coding_agent");
    expect(reply).toContain("GitHub (github)");
    expect(reply).toContain("Linear (linear)");
    expect(reply).not.toContain("I'm opencode");
    expect(reply).not.toContain("not Tags");
  });
});
