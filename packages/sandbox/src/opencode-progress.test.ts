import { describe, expect, it } from "vitest";
import { summarizeOpencodeProgressLine } from "./opencode-progress";

describe("summarizeOpencodeProgressLine", () => {
  it("maps bash git clone to cloning step", () => {
    expect(
      summarizeOpencodeProgressLine(
        JSON.stringify({
          type: "tool_use",
          part: {
            tool: "bash",
            state: { status: "running", input: { command: "git clone https://github.com/acme/repo" } },
          },
        }),
      ),
    ).toBe("Cloning the repo");
  });

  it("maps edit tools to making the fix", () => {
    expect(
      summarizeOpencodeProgressLine(
        JSON.stringify({
          type: "tool_use",
          part: { tool: "edit", state: { status: "completed" } },
        }),
      ),
    ).toBe("Making the fix");
  });

  it("maps GitHub PR composio tool", () => {
    expect(
      summarizeOpencodeProgressLine(
        JSON.stringify({
          type: "tool_use",
          part: {
            tool: "composio.GITHUB_CREATE_A_PULL_REQUEST",
            state: { status: "running" },
          },
        }),
      ),
    ).toBe("Opening a pull request");
  });

  it("maps readable stream lines", () => {
    expect(summarizeOpencodeProgressLine("✓ read")).toBe("Reading the code");
    expect(summarizeOpencodeProgressLine("✓ bash")).toBe("Running a command");
  });

  it("maps narration about video proof", () => {
    expect(
      summarizeOpencodeProgressLine(
        JSON.stringify({
          type: "text",
          part: { text: "Now I need to set up the video proof for the demo recording." },
        }),
      ),
    ).toBe("Recording proof video");
  });

  it("ignores empty lines", () => {
    expect(summarizeOpencodeProgressLine("   ")).toBeNull();
  });
});
