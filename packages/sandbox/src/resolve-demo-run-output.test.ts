import { describe, expect, it, vi } from "vitest";
import {
  buildRunOutputRawUrls,
  resolveDemoRunOutput,
} from "./resolve-demo-run-output";

const RECIPE = {
  prUrl: "https://github.com/laxman-patel/agent-artifacts/pull/14",
  repoUrl: "https://github.com/laxman-patel/agent-artifacts",
  branch: "fix/mcp-landing-link",
  commitSha: "f393e3d1a11e7d35e747155a495cbbdff5c2b54f",
  demo: {
    kind: "web" as const,
    startCommand: "npx turbo run dev --filter=@agent-artifacts/web",
    readyUrl: "http://127.0.0.1:3000",
    steps: [
      { type: "navigate" as const, url: "http://127.0.0.1:3000" },
      { type: "click" as const, selector: "#content a[href*='surfaces/mcp']" },
      { type: "waitForUrl" as const, url: "https://docs.hostartifacts.dev/surfaces/mcp" },
      { type: "assertUrl" as const, url: "https://docs.hostartifacts.dev/surfaces/mcp" },
    ],
  },
};

describe("buildRunOutputRawUrls", () => {
  it("builds raw urls for branch and sha", () => {
    const urls = buildRunOutputRawUrls({
      repoUrl: "https://github.com/laxman-patel/agent-artifacts",
      branch: "fix/mcp-landing-link",
      commitSha: "abc123",
    });
    expect(urls).toContain(
      "https://raw.githubusercontent.com/laxman-patel/agent-artifacts/abc123/.tags/run-output.json",
    );
    expect(urls).toContain(
      "https://raw.githubusercontent.com/laxman-patel/agent-artifacts/fix%2Fmcp-landing-link/.tags/run-output.json",
    );
  });
});

describe("resolveDemoRunOutput", () => {
  it("returns sandbox demo when already present", async () => {
    const result = await resolveDemoRunOutput({
      sandboxOutput: RECIPE,
      replyText: "done",
    });
    expect(result?.demo).toMatchObject({ kind: "web" });
  });

  it("scrapes PR url from reply and fetches recipe from GitHub (Maria/PR14 case)", async () => {
    const fetchFn = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("api.github.com") && url.includes("/pulls/14")) {
        return new Response(
          JSON.stringify({
            head: {
              ref: "fix/mcp-landing-link",
              sha: RECIPE.commitSha,
              repo: { html_url: RECIPE.repoUrl },
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("raw.githubusercontent.com") && url.includes("run-output.json")) {
        return new Response(JSON.stringify(RECIPE), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await resolveDemoRunOutput({
      sandboxOutput: undefined,
      replyText:
        "Done — PR #14 is up.\nPR: https://github.com/laxman-patel/agent-artifacts/pull/14\nVideo proof recipe committed.",
      spaceRepoUrl: "https://github.com/laxman-patel/agent-artifacts",
      fetchFn,
    });

    expect(result?.prUrl).toBe(RECIPE.prUrl);
    expect(result?.demo).toMatchObject({
      kind: "web",
      startCommand: RECIPE.demo.startCommand,
    });
    expect(result?.branch).toBe("fix/mcp-landing-link");
  });
});
