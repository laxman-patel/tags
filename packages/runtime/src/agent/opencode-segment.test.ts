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

  it("collapses excess blank lines left by removed noise", () => {
    const raw = "build · model/x\n\n\n\nReply text.";
    expect(cleanOpencodeReply(raw)).toBe("Reply text.");
  });
});
