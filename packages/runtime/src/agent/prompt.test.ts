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
    expect(prompt).toContain("internal Tags tools");
    expect(prompt).toContain("do not require approval");
    expect(prompt).toContain("search_channel");
    expect(prompt).toContain("github");
    expect(prompt).toContain("Composio connection-management helpers execute automatically without approval");
    expect(prompt).toContain("Slack and the Tags dashboard with Approve/Decline buttons");
  });

  it("injects frozen Space memory into the system prompt", () => {
    const prompt = buildOpencodeSystemPrompt(
      "# Identity\nYou are Tags.",
      "dev",
      {
        enabledTools: ["search_memory"],
        spaceMemorySnapshot:
          "SPACE MEMORY [10% - 20/2200 chars]\nThese are durable notes.\n\nUse pnpm.",
      },
    );

    expect(prompt).toContain("# Durable Space memory");
    expect(prompt).toContain("SPACE MEMORY");
    expect(prompt).toContain("Use pnpm.");
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

  it("adds mandatory demo recipe instructions when recording was requested", () => {
    const withRequest = buildOpencodeSystemPrompt("# Identity\nYou are Tags.", "dev", {
      demoRecordingRequested: true,
    });
    const withoutRequest = buildOpencodeSystemPrompt("# Identity\nYou are Tags.", "dev", {
      demoRecordingRequested: false,
    });

    expect(withRequest).toContain("# Demo recording required");
    expect(withRequest).toContain("MUST create or update .tags/run-output.json");
    expect(withRequest).toContain('Prefer demo.kind "web"');
    expect(withRequest).toContain("Do NOT hardcode /home/user/repo paths");
    expect(withRequest).toContain("not bun");
    expect(withoutRequest).not.toContain("# Demo recording required");
  });
});
