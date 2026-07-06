import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bareFireworksModelId,
  buildFireworksProviderConfig,
  buildOpencodeFireworksAuthJson,
  createSandboxProvider,
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
    expect(bareFireworksModelId("fireworks-ai/accounts/fireworks/models/kimi-k2-instruct")).toBe(
      "accounts/fireworks/models/kimi-k2-instruct",
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

    const provider = createSandboxProvider();
    const result = await provider.runCodingAgent({
      prompt: "update the docs",
      repoUrl: "https://github.com/acme/repo",
      session: { sandboxId: "existing-sandbox", keepAlive: true },
    });

    expect(mocks.connect).toHaveBeenCalledWith(
      "existing-sandbox",
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
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

  it("preserves one-shot sandbox behavior when no persistent session is provided", async () => {
    const sandbox = createMockSandbox("new-sandbox");
    mocks.create.mockResolvedValue(sandbox);

    const provider = createSandboxProvider();
    const result = await provider.runCodingAgent({
      prompt: "summarize the workspace",
    });

    expect(mocks.create).toHaveBeenCalled();
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

    const provider = createSandboxProvider();
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

    const provider = createSandboxProvider();
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
  });

  it("registers Fireworks router models in opencode config", async () => {
    const sandbox = createMockSandbox("new-sandbox");
    mocks.create.mockResolvedValue(sandbox);

    const provider = createSandboxProvider();
    await provider.runCodingAgent({
      prompt: "hello",
      model: "accounts/fireworks/routers/glm-5p2-fast",
    });

    const commands = sandbox.commands.run.mock.calls.map((call) => String(call[0]));
    expect(
      commands.some(
        (command) =>
          command.includes('"fireworks-ai"') &&
          command.includes('"accounts/fireworks/routers/glm-5p2-fast"'),
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

    const provider = createSandboxProvider();
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

    const provider = createSandboxProvider();
    const result = await provider.runCodingAgent({
      prompt: "fix the button",
      repoUrl: "https://github.com/acme/repo",
    });

    expect(result.runOutput?.prUrl).toBe("https://github.com/acme/repo/pull/34");
  });
});
