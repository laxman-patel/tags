import { describe, expect, it, vi } from "vitest";
import {
  listGitHubReposWithComposio,
  parseGitHubPrUrl,
  parseGitHubRepoUrl,
  testGitHubRepoAccessWithComposio,
  upsertDemoRecordingCommentWithComposio,
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

describe("upsertDemoRecordingCommentWithComposio", () => {
  it("creates a marker comment through Composio GitHub tools", async () => {
    const create = vi.fn(async () => ({
      html_url: "https://github.com/acme/repo/pull/1#issuecomment-1",
    }));

    const result = await upsertDemoRecordingCommentWithComposio({
      tools: {
        GITHUB_CREATE_AN_ISSUE_COMMENT: { execute: create },
      },
      prUrl: "https://github.com/acme/repo/pull/1",
      runId: "run-1",
      artifactUrl: "https://r2.example/demo.mp4",
      appUrl: "https://tags.example",
    });

    expect(result.htmlUrl).toContain("#issuecomment-1");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "repo",
        issue_number: 1,
        body: expect.stringContaining("<!-- tags-demo-recording:run-1 -->"),
      }),
      {},
    );
  });

  it("updates an existing marker comment when list and update tools are available", async () => {
    const list = vi.fn(async () => ({
      items: [
        {
          id: 123,
          body: "<!-- tags-demo-recording:run-1 --> old",
          html_url: "https://github.com/acme/repo/pull/1#issuecomment-123",
        },
      ],
    }));
    const update = vi.fn(async () => ({
      html_url: "https://github.com/acme/repo/pull/1#issuecomment-123",
    }));
    const create = vi.fn();

    await upsertDemoRecordingCommentWithComposio({
      tools: {
        GITHUB_LIST_COMMENTS_IN_AN_ISSUE: { execute: list },
        GITHUB_UPDATE_AN_ISSUE_COMMENT: { execute: update },
        GITHUB_CREATE_AN_ISSUE_COMMENT: { execute: create },
      },
      prUrl: "https://github.com/acme/repo/pull/1",
      runId: "run-1",
      artifactUrl: "https://r2.example/demo.mp4",
      appUrl: "https://tags.example",
      slackPermalink: "https://slack.example/file",
    });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "repo",
        comment_id: 123,
        body: expect.stringContaining("Slack upload: https://slack.example/file"),
      }),
      {},
    );
  });
});
