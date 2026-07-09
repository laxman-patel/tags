import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bareFireworksModelId,
  buildFireworksProviderConfig,
  buildOpencodeFireworksAuthJson,
  createSandboxProvider,
  extractOpencodeReply,
  extractOpencodeTokenUsage,
  estimateTokenUsageFromText,
  formatOpencodeJsonAsReadable,
  OPENCODE_FIREWORKS_PROVIDER_ID,
  toOpencodeModelId,
} from "./e2b-provider";

type MockSandbox = {
  sandboxId: string;
  commands: {
    run: ReturnType<typeof vi.fn>;
  };
  git: {
    clone: ReturnType<typeof vi.fn>;
  };
  kill: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  connect: vi.fn(),
}));

vi.mock("@e2b/desktop", () => ({
  Sandbox: {
    create: mocks.create,
    connect: mocks.connect,
  },
}));

function createMockSandbox(sandboxId: string): MockSandbox {
  return {
    sandboxId,
    commands: {
      run: vi.fn(async (command: string) => {
        if (command === "git diff") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (command === "cat .tags/run-output.json") {
          throw new Error("missing");
        }
        return { stdout: "Done.", stderr: "", exitCode: 0 };
      }),
    },
    git: {
      clone: vi.fn(async () => undefined),
    },
    kill: vi.fn(async () => undefined),
  };
}

describe("fireworks model helpers", () => {
  it("prefixes bare Fireworks ids for opencode", () => {
    expect(toOpencodeModelId("accounts/fireworks/routers/glm-5p2-fast")).toBe(
      "fireworks-ai/accounts/fireworks/routers/glm-5p2-fast",
    );
  });

  it("strips the opencode provider prefix", () => {
    expect(bareFireworksModelId("fireworks-ai/accounts/fireworks/routers/glm-5p2-fast")).toBe(
      "accounts/fireworks/routers/glm-5p2-fast",
    );
  });

  it("builds a provider block for Fireworks model paths", () => {
    expect(
      buildFireworksProviderConfig("accounts/fireworks/routers/glm-5p2-fast"),
    ).toEqual({
      "fireworks-ai": {
        models: {
          "accounts/fireworks/routers/glm-5p2-fast": {
            name: "GLM 5.2 Fast",
          },
        },
      },
    });
  });

  it("embeds Fireworks credentials in the provider block when a key is supplied", () => {
    expect(
      buildFireworksProviderConfig("accounts/fireworks/routers/glm-5p2-fast", "fw_test_key"),
    ).toEqual({
      "fireworks-ai": {
        options: {
          baseURL: "https://api.fireworks.ai/inference/v1",
          apiKey: "fw_test_key",
        },
        models: {
          "accounts/fireworks/routers/glm-5p2-fast": {
            name: "GLM 5.2 Fast",
          },
        },
      },
    });
  });

  it("builds opencode auth credentials for Fireworks", () => {
    expect(buildOpencodeFireworksAuthJson("fw_test_key")).toEqual({
      [OPENCODE_FIREWORKS_PROVIDER_ID]: {
        type: "api",
        key: "fw_test_key",
      },
    });
  });
});

describe("createSandboxProvider", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.connect.mockReset();
  });

  it("keeps a persistent session alive after reconnecting", async () => {
    const sandbox = createMockSandbox("existing-sandbox");
    mocks.connect.mockResolvedValue(sandbox);

    const provider = createSandboxProvider({ modelApiKey: "fw_test_key" });
    const result = await provider.runCodingAgent({
      prompt: "update the docs",
      repoUrl: "https://github.com/acme/repo",
      session: { sandboxId: "existing-sandbox", keepAlive: true },
    });

    expect(mocks.connect).toHaveBeenCalledWith(
      "existing-sandbox",
      expect.objectContaining({
        timeoutMs: expect.any(Number),
        envs: { FIREWORKS_API_KEY: "fw_test_key" },
      }),
    );
    const commands = sandbox.commands.run.mock.calls.map((call) => String(call[0]));
    expect(commands.some((command) => command.includes("FIREWORKS_API_KEY='fw_test_key'"))).toBe(
      true,
    );
    expect(commands.some((command) => command.includes('"apiKey": "fw_test_key"'))).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(sandbox.kill).not.toHaveBeenCalled();
    expect(sandbox.git.clone).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      sandboxId: "existing-sandbox",
      createdSandbox: false,
      reusedSandbox: true,
      exitCode: 0,
    });
  });

  it("bootstraps Fireworks credentials when reconnecting fails and a new sandbox is created", async () => {
    const sandbox = createMockSandbox("replacement-sandbox");
    mocks.connect.mockRejectedValue(new Error("sandbox expired"));
    mocks.create.mockResolvedValue(sandbox);

    const provider = createSandboxProvider({ modelApiKey: "fw_test_key" });
    const result = await provider.runCodingAgent({
      prompt: "summarize the repo",
      session: { sandboxId: "stale-sandbox", keepAlive: true },
    });

    expect(mocks.connect).toHaveBeenCalledWith(
      "stale-sandbox",
      expect.objectContaining({
        envs: { FIREWORKS_API_KEY: "fw_test_key" },
      }),
    );
    expect(mocks.create).toHaveBeenCalledWith(
      "tags-opencode-desktop",
      expect.objectContaining({
        envs: { FIREWORKS_API_KEY: "fw_test_key" },
        resolution: [1280, 800],
      }),
    );
    const commands = sandbox.commands.run.mock.calls.map((call) => String(call[0]));
    expect(commands.some((command) => command.includes("FIREWORKS_API_KEY='fw_test_key'"))).toBe(
      true,
    );
    expect(result).toMatchObject({
      sandboxId: "replacement-sandbox",
      createdSandbox: true,
      reusedSandbox: false,
      exitCode: 0,
    });
  });

  it("preserves one-shot sandbox behavior when no persistent session is provided", async () => {
    const sandbox = createMockSandbox("new-sandbox");
    mocks.create.mockResolvedValue(sandbox);

    const provider = createSandboxProvider({ modelApiKey: "fw_test_key" });
    const result = await provider.runCodingAgent({
      prompt: "summarize the workspace",
    });

    expect(mocks.create).toHaveBeenCalledWith(
      "tags-opencode-desktop",
      expect.objectContaining({
        envs: { FIREWORKS_API_KEY: "fw_test_key" },
        resolution: [1280, 800],
      }),
    );
    expect(sandbox.kill).toHaveBeenCalled();
    expect(result).toMatchObject({
      sandboxId: "new-sandbox",
      createdSandbox: true,
      reusedSandbox: false,
      exitCode: 0,
    });
  });

  it("writes opencode MCP config when remote servers are provided", async () => {
    const sandbox = createMockSandbox("new-sandbox");
    mocks.create.mockResolvedValue(sandbox);

    const provider = createSandboxProvider({ modelApiKey: "fw_test_key" });
    await provider.runCodingAgent({
      prompt: "list issues",
      mcpServers: {
        composio: {
          type: "remote",
          url: "https://mcp.example.test",
          enabled: true,
          headers: { Authorization: "Bearer token" },
        },
      },
    });

    const commands = sandbox.commands.run.mock.calls.map((call) => String(call[0]));
    expect(commands.some((command) => command.includes('"mcp"'))).toBe(true);
    expect(commands.some((command) => command.includes('"composio"'))).toBe(true);
    expect(commands.some((command) => command.includes("OPENCODE_CONFIG="))).toBe(true);
  });

  it("runs opencode with the Tags agent when a system prompt is provided", async () => {
    const sandbox = createMockSandbox("new-sandbox");
    mocks.create.mockResolvedValue(sandbox);

    const provider = createSandboxProvider({ modelApiKey: "fw_test_key" });
    await provider.runCodingAgent({
      prompt: "# Task thread\n[user]\n@tags what changed?",
      systemPrompt: "You are Tags for the #dev Space.",
    });

    const commands = sandbox.commands.run.mock.calls.map((call) => String(call[0]));
    expect(commands.some((command) => command.includes('"agent"'))).toBe(true);
    expect(commands.some((command) => command.includes('"tags"'))).toBe(true);
    expect(commands.some((command) => command.includes("You are Tags for the #dev Space."))).toBe(
      true,
    );
    expect(commands.some((command) => command.includes("opencode run --auto --agent 'tags'"))).toBe(
      true,
    );
    expect(commands.some((command) => command.includes("--format json"))).toBe(true);
    expect(commands.some((command) => command.includes('"permission": "allow"'))).toBe(true);
  });

  it("registers Fireworks router models in opencode config", async () => {
    const sandbox = createMockSandbox("new-sandbox");
    mocks.create.mockResolvedValue(sandbox);

    const provider = createSandboxProvider({ modelApiKey: "fw_test_key" });
    await provider.runCodingAgent({
      prompt: "hello",
      model: "accounts/fireworks/routers/glm-5p2-fast",
    });

    const commands = sandbox.commands.run.mock.calls.map((call) => String(call[0]));
    expect(
      commands.some(
        (command) =>
          command.includes('"fireworks-ai"') &&
          command.includes('"accounts/fireworks/routers/glm-5p2-fast"') &&
          command.includes('"apiKey": "fw_test_key"'),
      ),
    ).toBe(true);
  });

  it("writes Fireworks credentials to opencode auth.json when a key is configured", async () => {
    const sandbox = createMockSandbox("new-sandbox");
    mocks.create.mockResolvedValue(sandbox);

    const provider = createSandboxProvider({ modelApiKey: "fw_test_key" });
    await provider.runCodingAgent({ prompt: "hello" });

    const commands = sandbox.commands.run.mock.calls.map((call) => String(call[0]));
    expect(
      commands.some(
        (command) =>
          command.includes("/home/user/.local/share/opencode/auth.json") &&
          command.includes('"type": "api"') &&
          command.includes("fw_test_key"),
      ),
    ).toBe(true);
    expect(commands.some((command) => command.includes("FIREWORKS_API_KEY='fw_test_key'"))).toBe(
      true,
    );
  });

  it("requires a Fireworks API key when creating the sandbox provider", () => {
    expect(() => createSandboxProvider()).toThrow("FIREWORKS_API_KEY is required");
  });

  it("reads structured run output from the repo", async () => {
    const sandbox = createMockSandbox("new-sandbox");
    sandbox.commands.run.mockImplementation(async (command: string) => {
      if (command === "test -e '/home/user/repo/.git'") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (command === "git diff") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (command === "cat .tags/run-output.json") {
        return {
          stdout: JSON.stringify({
            prUrl: "https://github.com/acme/repo/pull/12",
            repoUrl: "https://github.com/acme/repo",
            branch: "tags/demo",
            demo: {
              kind: "web",
              startCommand: "pnpm dev",
              readyUrl: "http://127.0.0.1:3000",
              steps: [{ type: "navigate", url: "http://127.0.0.1:3000" }],
            },
          }),
          stderr: "",
          exitCode: 0,
        };
      }
      return { stdout: "Done.", stderr: "", exitCode: 0 };
    });
    mocks.create.mockResolvedValue(sandbox);

    const provider = createSandboxProvider({ modelApiKey: "fw_test_key" });
    const result = await provider.runCodingAgent({
      prompt: "fix the button",
      repoUrl: "https://github.com/acme/repo",
    });

    expect(result.runOutput).toMatchObject({
      prUrl: "https://github.com/acme/repo/pull/12",
      branch: "tags/demo",
    });
    expect(result.runOutput).not.toHaveProperty("demo");
  });

  it("falls back to a PR URL found in opencode output", async () => {
    const sandbox = createMockSandbox("new-sandbox");
    sandbox.commands.run.mockImplementation(async (command: string) => {
      if (command === "git diff") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (command === "cat .tags/run-output.json") {
        throw new Error("missing");
      }
      if (command.includes("git remote get-url") || command.includes("git rev-parse")) {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (command.includes("find /home/user")) {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return {
        stdout: "Opened https://github.com/acme/repo/pull/34",
        stderr: "",
        exitCode: 0,
      };
    });
    mocks.create.mockResolvedValue(sandbox);

    const provider = createSandboxProvider({ modelApiKey: "fw_test_key" });
    const result = await provider.runCodingAgent({
      prompt: "fix the button",
      repoUrl: "https://github.com/acme/repo",
    });

    expect(result.runOutput?.prUrl).toBe("https://github.com/acme/repo/pull/34");
  });

  it("harvests repo/branch/sha from git when run-output.json is missing", async () => {
    const sandbox = createMockSandbox("harvest-sandbox");
    sandbox.commands.run.mockImplementation(async (command: string) => {
      if (command === "git diff") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (command === "cat .tags/run-output.json") {
        throw new Error("missing");
      }
      if (command.includes("find /home/user")) {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (command.includes("git remote get-url")) {
        return { stdout: "git@github.com:acme/repo.git\n", stderr: "", exitCode: 0 };
      }
      if (command.includes("abbrev-ref")) {
        return { stdout: "fix/mcp-link\n", stderr: "", exitCode: 0 };
      }
      if (command.includes("git rev-parse HEAD")) {
        return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "Done.", stderr: "", exitCode: 0 };
    });
    mocks.create.mockResolvedValue(sandbox);

    const provider = createSandboxProvider({ modelApiKey: "fw_test_key" });
    const result = await provider.runCodingAgent({
      prompt: "fix the button",
      repoUrl: "https://github.com/acme/repo",
    });

    expect(result.runOutput).toMatchObject({
      repoUrl: "https://github.com/acme/repo",
      branch: "fix/mcp-link",
      commitSha: "abc123def456",
    });
  });

  it("extracts replyText from JSON output and converts output to readable", async () => {
    const sandbox = createMockSandbox("json-sandbox");
    sandbox.commands.run.mockImplementation(async (command: string) => {
      if (command === "git diff") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (command === "cat .tags/run-output.json") {
        throw new Error("missing");
      }
      return {
        stdout: [
          JSON.stringify({ type: "tool_use", part: { tool: "bash", state: { status: "completed" } } }),
          JSON.stringify({ type: "text", part: { type: "text", text: "The repo is about X." } }),
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      };
    });
    mocks.create.mockResolvedValue(sandbox);

    const provider = createSandboxProvider({ modelApiKey: "fw_test_key" });
    const result = await provider.runCodingAgent({ prompt: "what is this repo about?" });

    expect(result.replyText).toBe("The repo is about X.");
    expect(result.output).toContain("The repo is about X.");
    expect(result.output).toContain("✓ bash");
  });
});

describe("extractOpencodeTokenUsage", () => {
  it("sums tokens and provider cost across step_finish events", () => {
    const raw = [
      JSON.stringify({
        type: "step_finish",
        part: {
          reason: "tool-calls",
          tokens: { input: 1000, output: 50 },
          cost: 0.002,
        },
      }),
      JSON.stringify({
        type: "step_finish",
        part: {
          reason: "stop",
          tokens: { input: 500, output: 200, reasoning: 10 },
          cost: 0.005,
        },
      }),
    ].join("\n");

    expect(extractOpencodeTokenUsage(raw)).toEqual({
      promptTokens: 1500,
      completionTokens: 260,
      freshInputTokens: 1500,
      cacheWriteTokens: 0,
      cachedReadTokens: 0,
      costMicroUsd: 7000,
      source: "opencode",
    });
  });

  it("tracks cache read and write separately", () => {
    const raw = JSON.stringify({
      type: "step_finish",
      part: {
        reason: "stop",
        tokens: { input: 2, output: 34, cache: { write: 11132, read: 256 } },
        cost: 0.014087,
      },
    });

    expect(extractOpencodeTokenUsage(raw)).toEqual({
      promptTokens: 11390,
      completionTokens: 34,
      freshInputTokens: 2,
      cacheWriteTokens: 11132,
      cachedReadTokens: 256,
      costMicroUsd: 14087,
      source: "opencode",
    });
  });

  it("returns null when no step_finish events are present", () => {
    expect(extractOpencodeTokenUsage("plain text output")).toBeNull();
  });
});

describe("estimateTokenUsageFromText", () => {
  it("estimates tokens from character counts", () => {
    expect(estimateTokenUsageFromText("abcd", "abcdefgh")).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      freshInputTokens: 1,
      cacheWriteTokens: 0,
      cachedReadTokens: 0,
      source: "estimated",
    });
  });
});

describe("extractOpencodeReply", () => {
  it("extracts only text events after the last tool_use (filters narration)", () => {
    const raw = [
      JSON.stringify({ type: "text", part: { type: "text", text: "Let me check the repo." } }),
      JSON.stringify({ type: "tool_use", part: { tool: "bash", state: { status: "completed" } } }),
      JSON.stringify({ type: "text", part: { type: "text", text: "Now let me read the files." } }),
      JSON.stringify({ type: "tool_use", part: { tool: "read", state: { status: "completed" } } }),
      JSON.stringify({ type: "text", part: { type: "text", text: "Here is the answer." } }),
      JSON.stringify({ type: "text", part: { type: "text", text: "More detail." } }),
    ].join("\n");
    expect(extractOpencodeReply(raw)).toBe("Here is the answer.\n\nMore detail.");
  });

  it("keeps all text when there are no tool_use events", () => {
    const raw = [
      JSON.stringify({ type: "text", part: { type: "text", text: "Hello." } }),
      JSON.stringify({ type: "text", part: { type: "text", text: "World." } }),
    ].join("\n");
    expect(extractOpencodeReply(raw)).toBe("Hello.\n\nWorld.");
  });

  it("returns null for non-JSON output", () => {
    expect(extractOpencodeReply("Just plain text output.")).toBeNull();
  });

  it("returns null when no text events exist after tool_use", () => {
    const raw = [
      JSON.stringify({ type: "text", part: { type: "text", text: "Let me check." } }),
      JSON.stringify({ type: "tool_use", part: { tool: "bash", state: { status: "completed" } } }),
    ].join("\n");
    expect(extractOpencodeReply(raw)).toBeNull();
  });
});

describe("formatOpencodeJsonAsReadable", () => {
  it("converts JSON events to readable text", () => {
    const raw = [
      JSON.stringify({ type: "tool_use", part: { tool: "bash", state: { status: "completed" } } }),
      JSON.stringify({ type: "text", part: { type: "text", text: "The answer." } }),
      JSON.stringify({ type: "tool_use", part: { tool: "read", state: { status: "error", error: "file not found" } } }),
    ].join("\n");
    expect(formatOpencodeJsonAsReadable(raw)).toBe("✓ bash\nThe answer.\n✗ read failed: file not found");
  });

  it("returns null for non-JSON output", () => {
    expect(formatOpencodeJsonAsReadable("Plain text only.")).toBeNull();
  });
});
