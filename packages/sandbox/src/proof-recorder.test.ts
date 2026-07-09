import { describe, expect, it } from "vitest";
import { playwrightScript } from "./proof-recorder";
import type { ProofStep } from "./types";

describe("playwrightScript", () => {
  it("serializes navigate and click steps", () => {
    const steps: ProofStep[] = [
      { type: "navigate", url: "http://127.0.0.1:3000" },
      { type: "click", selector: "a[href='/docs']" },
      { type: "assertUrl", url: "/docs" },
    ];
    const script = playwrightScript(steps);
    expect(script).toContain("http://127.0.0.1:3000");
    expect(script).toContain("a[href='/docs']");
    expect(script).toContain("assertUrl");
    expect(script).toContain("chromium.launch");
    expect(script).toContain("headless: false");
  });
});
