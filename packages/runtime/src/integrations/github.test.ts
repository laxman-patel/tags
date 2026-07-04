import { afterEach, describe, expect, it, vi } from "vitest";
import { parseGitHubPrUrl, upsertDemoRecordingComment } from "./github";

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

describe("upsertDemoRecordingComment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a marker comment when one does not exist", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ html_url: "https://github.com/acme/repo/pull/1#issuecomment-1" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await upsertDemoRecordingComment({
      token: "token",
      prUrl: "https://github.com/acme/repo/pull/1",
      runId: "run-1",
      artifactUrl: "https://r2.example/demo.mp4",
      appUrl: "https://tags.example",
    });

    expect(result.htmlUrl).toContain("#issuecomment-1");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.github.com/repos/acme/repo/issues/1/comments",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("<!-- tags-demo-recording:run-1 -->"),
      }),
    );
  });

  it("updates an existing marker comment", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 123,
              body: "<!-- tags-demo-recording:run-1 --> old",
              html_url: "https://github.com/acme/repo/pull/1#issuecomment-123",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ html_url: "https://github.com/acme/repo/pull/1#issuecomment-123" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await upsertDemoRecordingComment({
      token: "token",
      prUrl: "https://github.com/acme/repo/pull/1",
      runId: "run-1",
      artifactUrl: "https://r2.example/demo.mp4",
      appUrl: "https://tags.example",
      slackPermalink: "https://slack.example/file",
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.github.com/repos/acme/repo/issues/comments/123",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining("Slack upload: https://slack.example/file"),
      }),
    );
  });
});
