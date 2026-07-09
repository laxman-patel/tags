import { describe, expect, it } from "vitest";
import { cleanOpencodeReply } from "./opencode-segment";

describe("cleanOpencodeReply", () => {
  it("strips the model header line", () => {
    const raw = [
      "build · accounts/fireworks/routers/glm-5p2-fast",
      "",
      "Here is the answer you asked for.",
    ].join("\n");
    expect(cleanOpencodeReply(raw)).toBe("Here is the answer you asked for.");
  });

  it("strips piped/quoted model header variants", () => {
    const raw = "| build · accounts/fireworks/routers/glm-5p2-fast\nHello.";
    expect(cleanOpencodeReply(raw)).toBe("Hello.");
  });

  it("strips banner art and share links", () => {
    const raw = [
      "█▀▀█ █▀▀█ █▀▀",
      "▀▀▀▀ ▀  ▀ ▀▀▀",
      "~ https://opencode.ai/s/abc123",
      "The actual reply.",
    ].join("\n");
    expect(cleanOpencodeReply(raw)).toBe("The actual reply.");
  });

  it("drops the appended git diff section", () => {
    const raw = "Done, updated the file.\n\n--- git diff ---\ndiff --git a/x b/x";
    expect(cleanOpencodeReply(raw)).toBe("Done, updated the file.");
  });

  it("keeps normal markdown content intact", () => {
    const raw = "## Summary\n\n- item one\n- item two\n\n```ts\nconst x = 1;\n```";
    expect(cleanOpencodeReply(raw)).toBe(raw);
  });

  it("drops tool checkmarks and permission noise from Slack-facing replies", () => {
    const raw = [
      "I'll start by locating the landing page.",
      "✓ grep",
      "✓ bash",
      "✗ bash failed",
      "! permission requested: external_directory (/tmp/*); auto-rejecting",
      "",
      "Opened the PR: https://github.com/acme/repo/pull/1",
    ].join("\n");
    expect(cleanOpencodeReply(raw)).toBe(
      "I'll start by locating the landing page.\n\nOpened the PR: https://github.com/acme/repo/pull/1",
    );
  });

  it("collapses excess blank lines", () => {
    const raw = "First paragraph.\n\n\n\nSecond paragraph.";
    expect(cleanOpencodeReply(raw)).toBe("First paragraph.\n\nSecond paragraph.");
  });
});
