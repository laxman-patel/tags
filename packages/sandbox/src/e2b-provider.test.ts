import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bareFireworksModelId,
  buildFireworksProviderConfig,
  buildOpencodeFireworksAuthJson,
  createSandboxProvider,
  extractOpencodeReply,
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

vi.mock("e2b", () => ({
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
      "opencode",
      expect.objectContaining({
        envs: { FIREWORKS_API_KEY: "fw_test_key" },
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
      "opencode",
      expect.objectContaining({
        envs: { FIREWORKS_API_KEY: "fw_test_key" },
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
    expect(commands.some((command) => command.includes("opencode run --agent 'tags'"))).toBe(
      true,
    );
    expect(commands.some((command) => command.includes("--format json"))).toBe(true);
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
      demo: { kind: "web", startCommand: "pnpm dev" },
    });
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
