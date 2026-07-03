import { describe, expect, it } from "vitest";
import {
  buildOpencodePrompt,
  buildOpencodeSystemPrompt,
  buildOpencodeUserPrompt,
} from "./prompt";

describe("opencode prompts", () => {
  it("keeps the Slack-facing Tags identity explicit for opencode runs", () => {
    const prompt = buildOpencodeSystemPrompt(
      "# Identity\nYou are Tags.",
      "dev",
      { enabledTools: ["search_thread"], connectedToolkits: ["github"] },
    );

    expect(prompt).toContain("You are Tags, running inside a shared Slack channel (#dev Space).");
    expect(prompt).toContain("opencode is only the sandbox coding harness");
    expect(prompt).toContain("Do not answer\n  as the opencode CLI");
    expect(prompt).toContain("search_channel");
    expect(prompt).toContain("github");
  });

  it("keeps Slack thread text in the user prompt", () => {
    const prompt = buildOpencodeUserPrompt([
      { role: "user", content: "@tags inspect the repo" },
    ]);

    expect(prompt).toContain("# Task thread");
    expect(prompt).toContain("@tags inspect the repo");
    expect(prompt).toContain("Write only the final\nSlack-facing reply as Tags");
  });

  it("can still build a flattened prompt for callers that need one", () => {
    const prompt = buildOpencodePrompt(
      "# Identity\nYou are Tags.",
      "dev",
      [{ role: "user", content: "@tags inspect the repo" }],
      { enabledTools: ["search_thread"], connectedToolkits: ["github"] },
    );

    expect(prompt).toContain("opencode is only the sandbox coding harness");
    expect(prompt).toContain("# Task thread");
  });
});
