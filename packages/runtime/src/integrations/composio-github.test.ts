import { describe, expect, it, vi } from "vitest";
import {
  listGitHubReposWithComposio,
  parseGitHubPrUrl,
  parseGitHubRepoUrl,
  testGitHubRepoAccessWithComposio,
} from "./composio-github";

describe("parseGitHubRepoUrl", () => {
  it("parses GitHub repository URLs", () => {
    expect(parseGitHubRepoUrl("https://github.com/acme/repo")).toEqual({
      owner: "acme",
      repo: "repo",
    });
    expect(parseGitHubRepoUrl("https://github.com/acme/repo.git")).toEqual({
      owner: "acme",
      repo: "repo",
    });
  });

  it("rejects unsupported URLs", () => {
    expect(parseGitHubRepoUrl("https://example.com/acme/repo")).toBeNull();
    expect(parseGitHubRepoUrl("https://github.com/acme")).toBeNull();
  });
});

describe("parseGitHubPrUrl", () => {
  it("parses GitHub pull request URLs", () => {
    expect(parseGitHubPrUrl("https://github.com/acme/repo/pull/42")).toEqual({
      owner: "acme",
      repo: "repo",
      number: 42,
    });
  });

  it("rejects unsupported URLs", () => {
    expect(parseGitHubPrUrl("https://example.com/acme/repo/pull/42")).toBeNull();
    expect(parseGitHubPrUrl("https://github.com/acme/repo/issues/42")).toBeNull();
  });
});

describe("listGitHubReposWithComposio", () => {
  it("lists repositories through a Composio GitHub tool", async () => {
    const execute = vi.fn(async () => ({
      data: [
        {
          id: 1,
          full_name: "acme/alpha",
          html_url: "https://github.com/acme/alpha",
          private: false,
          default_branch: "main",
        },
        {
          id: 2,
          full_name: "acme/beta",
          html_url: "https://github.com/acme/beta",
          private: true,
          default_branch: "main",
        },
      ],
    }));

    const result = await listGitHubReposWithComposio({
      tools: {
        GITHUB_GET_REPOS: { execute },
      },
    });

    expect(result).toEqual({
      ok: true,
      repos: [
        {
          id: "1",
          fullName: "acme/alpha",
          htmlUrl: "https://github.com/acme/alpha",
          private: false,
          defaultBranch: "main",
        },
        {
          id: "2",
          fullName: "acme/beta",
          htmlUrl: "https://github.com/acme/beta",
          private: true,
          defaultBranch: "main",
        },
      ],
    });
    expect(execute).toHaveBeenCalledWith({}, {});
  });

  it("reports when Composio does not expose a repo list tool", async () => {
    await expect(
      listGitHubReposWithComposio({
        tools: {},
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: "github_tool_unavailable",
    });
  });
});

describe("testGitHubRepoAccessWithComposio", () => {
  it("checks repository metadata through a Composio GitHub tool", async () => {
    const execute = vi.fn(async () => ({
      data: {
        private: true,
        default_branch: "main",
      },
    }));

    const result = await testGitHubRepoAccessWithComposio({
      tools: {
        GITHUB_GET_A_REPOSITORY: { execute },
      },
      owner: "acme",
      repo: "repo",
    });

    expect(result).toEqual({
      ok: true,
      status: "reachable",
      private: true,
      defaultBranch: "main",
      message: "Repository metadata is reachable through the Space's Composio GitHub connection.",
    });
    expect(execute).toHaveBeenCalledWith({ owner: "acme", repo: "repo" }, {});
  });

  it("reports when Composio does not expose a repo metadata tool", async () => {
    await expect(
      testGitHubRepoAccessWithComposio({
        tools: {},
        owner: "acme",
        repo: "repo",
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: "github_tool_unavailable",
    });
  });
});
