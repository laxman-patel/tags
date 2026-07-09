import { describe, expect, it } from "vitest";
import {
  extractGitHubPrUrl,
  mergeTagsRunOutput,
  normalizeGitHubRepoUrl,
  parseTagsRunOutputJson,
} from "./run-output";

describe("normalizeGitHubRepoUrl", () => {
  it("normalizes https and ssh remotes", () => {
    expect(normalizeGitHubRepoUrl("https://github.com/acme/repo.git")).toBe(
      "https://github.com/acme/repo",
    );
    expect(normalizeGitHubRepoUrl("git@github.com:acme/repo.git")).toBe(
      "https://github.com/acme/repo",
    );
    expect(normalizeGitHubRepoUrl("github.com/acme/repo")).toBe(
      "https://github.com/acme/repo",
    );
  });

  it("rejects non-github remotes", () => {
    expect(normalizeGitHubRepoUrl("https://gitlab.com/acme/repo")).toBeUndefined();
  });
});

describe("mergeTagsRunOutput", () => {
  it("fills gaps without overwriting earlier fields", () => {
    expect(
      mergeTagsRunOutput(
        { demo: { kind: "terminal", command: "npm test" } },
        { repoUrl: "https://github.com/acme/repo", branch: "fix/x" },
        { prUrl: "https://github.com/acme/repo/pull/1", branch: "other" },
      ),
    ).toEqual({
      demo: { kind: "terminal", command: "npm test" },
      repoUrl: "https://github.com/acme/repo",
      branch: "fix/x",
      prUrl: "https://github.com/acme/repo/pull/1",
    });
  });
});

describe("parseTagsRunOutputJson", () => {
  it("parses waitForUrl steps", () => {
    const parsed = parseTagsRunOutputJson(
      JSON.stringify({
        repoUrl: "https://github.com/acme/repo",
        demo: {
          kind: "web",
          startCommand: "npx next dev --port 3000",
          readyUrl: "http://127.0.0.1:3000",
          steps: [
            { type: "navigate", url: "http://127.0.0.1:3000" },
            { type: "click", selector: "a[href*='mcp']" },
            { type: "waitForUrl", url: "/surfaces/mcp" },
            { type: "assertUrl", url: "/surfaces/mcp" },
          ],
        },
      }),
    );
    expect(parsed?.demo).toMatchObject({ kind: "web" });
    if (parsed?.demo?.kind === "web") {
      expect(parsed.demo.steps.map((s) => s.type)).toEqual([
        "navigate",
        "click",
        "waitForUrl",
        "assertUrl",
      ]);
    }
  });
});

describe("extractGitHubPrUrl", () => {
  it("finds PR urls in text", () => {
    expect(
      extractGitHubPrUrl("Opened https://github.com/acme/repo/pull/34 thanks"),
    ).toBe("https://github.com/acme/repo/pull/34");
  });
});
