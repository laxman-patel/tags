import { describe, expect, it } from "vitest";
import {
  isTerminalDemoCheat,
  triggerRequiresClickThrough,
  triggerRequiresWebDemo,
  validateDemoRecipeForRecording,
} from "./demo-recipe-guard";
import type { DemoRecipe } from "./types";

const MARIA_TRIGGER =
  "@tags fix the mcp link bug maria found — both “…or connect with MCP” links on the landing page (apps/web/app/page.tsx) go to /cli/login but should open ${docsUrl()}/surfaces/mcp (same as footer docs, new tab). tiny diff only. open a PR and send a video proof clicking the link so we can see it land on the right docs page :clapper:";

const CHEAT_TERMINAL: DemoRecipe = {
  kind: "terminal",
  command: "node .tags/verify-fix.mjs",
};

const GOOD_WEB: DemoRecipe = {
  kind: "web",
  repoSubdir: "apps/web",
  startCommand: "npx next dev --port 3000",
  readyUrl: "http://127.0.0.1:3000",
  steps: [
    { type: "navigate", url: "http://127.0.0.1:3000" },
    { type: "click", selector: "a[href*='/surfaces/mcp']" },
    { type: "waitForUrl", url: "/surfaces/mcp" },
    { type: "assertUrl", url: "/surfaces/mcp" },
  ],
};

describe("triggerRequiresWebDemo", () => {
  it("detects Maria-style landing-page link proofs", () => {
    expect(triggerRequiresWebDemo(MARIA_TRIGGER)).toBe(true);
  });

  it("detects common UI / browser phrasings", () => {
    expect(triggerRequiresWebDemo("video proof of the button on the UI")).toBe(true);
    expect(triggerRequiresWebDemo("record the frontend homepage")).toBe(true);
    expect(triggerRequiresWebDemo("show the docs page after opening the link")).toBe(true);
    expect(triggerRequiresWebDemo("fix apps/web/app/page.tsx MCP links")).toBe(true);
  });

  it("does not force web for CLI-only proofs", () => {
    expect(triggerRequiresWebDemo("fix the CLI and send a video proof")).toBe(false);
    expect(triggerRequiresWebDemo("record a demo of the API change")).toBe(false);
  });
});

describe("triggerRequiresClickThrough", () => {
  it("detects click / land-on requests", () => {
    expect(triggerRequiresClickThrough(MARIA_TRIGGER)).toBe(true);
    expect(triggerRequiresClickThrough("click the MCP link and show it lands on docs")).toBe(
      true,
    );
  });
});

describe("isTerminalDemoCheat", () => {
  it("flags verify-fix and PASS echo scripts", () => {
    expect(isTerminalDemoCheat("node .tags/verify-fix.mjs")).toBe(true);
    expect(isTerminalDemoCheat("echo 'PASS: Both MCP links fixed'")).toBe(true);
    expect(isTerminalDemoCheat("rg href apps/web/app/page.tsx | grep surfaces/mcp")).toBe(true);
    expect(isTerminalDemoCheat("git diff apps/web/app/page.tsx")).toBe(true);
    expect(isTerminalDemoCheat("cat apps/web/app/page.tsx | head")).toBe(true);
  });

  it("allows real product commands", () => {
    expect(isTerminalDemoCheat("npm test")).toBe(false);
    expect(isTerminalDemoCheat("pnpm exec vitest run packages/foo")).toBe(false);
    expect(isTerminalDemoCheat("./cli doctor && ./cli status")).toBe(false);
  });
});

describe("validateDemoRecipeForRecording", () => {
  it("rejects Maria's actual cheat recipe (terminal verify-fix)", () => {
    const result = validateDemoRecipeForRecording({
      demo: CHEAT_TERMINAL,
      triggerText: MARIA_TRIGGER,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/browser demo|demo\.kind "web"/i);
    }
  });

  it("rejects any terminal recipe when the trigger needs web proof", () => {
    const result = validateDemoRecipeForRecording({
      demo: { kind: "terminal", command: "npm test" },
      triggerText: MARIA_TRIGGER,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects terminal PASS cheats even for generic video requests", () => {
    const result = validateDemoRecipeForRecording({
      demo: CHEAT_TERMINAL,
      triggerText: "@tags fix the CLI and send a video proof",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/PASS script|source-check/i);
    }
  });

  it("allows a real terminal demo for CLI-only requests", () => {
    const result = validateDemoRecipeForRecording({
      demo: { kind: "terminal", command: "npm test -- packages/cli" },
      triggerText: "@tags fix the CLI and send a video proof",
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts a proper click-through web recipe for Maria's request", () => {
    expect(
      validateDemoRecipeForRecording({
        demo: GOOD_WEB,
        triggerText: MARIA_TRIGGER,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects navigate-only web demos", () => {
    const result = validateDemoRecipeForRecording({
      demo: {
        kind: "web",
        startCommand: "npx next dev --port 3000",
        readyUrl: "http://127.0.0.1:3000",
        steps: [
          { type: "navigate", url: "http://127.0.0.1:3000" },
          { type: "waitMs", ms: 2000 },
        ],
      },
      triggerText: MARIA_TRIGGER,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/only navigates/i);
  });

  it("rejects click-through requests without a click step", () => {
    const result = validateDemoRecipeForRecording({
      demo: {
        kind: "web",
        startCommand: "npx next dev --port 3000",
        readyUrl: "http://127.0.0.1:3000",
        steps: [
          { type: "navigate", url: "http://127.0.0.1:3000" },
          { type: "waitForText", text: "MCP" },
        ],
      },
      triggerText: MARIA_TRIGGER,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no click/i);
  });

  it("rejects click without URL proof when the user asked where the link lands", () => {
    const result = validateDemoRecipeForRecording({
      demo: {
        kind: "web",
        startCommand: "npx next dev --port 3000",
        readyUrl: "http://127.0.0.1:3000",
        steps: [
          { type: "navigate", url: "http://127.0.0.1:3000" },
          { type: "click", selector: "a[href*='mcp']" },
          { type: "waitMs", ms: 1000 },
        ],
      },
      triggerText: MARIA_TRIGGER,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/waitForUrl|assertUrl|destination/i);
  });

  it("rejects assertUrl before click", () => {
    const result = validateDemoRecipeForRecording({
      demo: {
        kind: "web",
        startCommand: "npx next dev --port 3000",
        readyUrl: "http://127.0.0.1:3000",
        steps: [
          { type: "navigate", url: "http://127.0.0.1:3000" },
          { type: "assertUrl", url: "/surfaces/mcp" },
          { type: "click", selector: "a[href*='mcp']" },
        ],
      },
      triggerText: MARIA_TRIGGER,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/before click/i);
  });

  it("rejects demo.kind none", () => {
    const result = validateDemoRecipeForRecording({
      demo: { kind: "none", reason: "too hard" },
      triggerText: MARIA_TRIGGER,
    });
    expect(result.ok).toBe(false);
  });
});
