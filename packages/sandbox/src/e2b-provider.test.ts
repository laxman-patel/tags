import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSandboxProvider } from "./e2b-provider";

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
        return { stdout: "Done.", stderr: "", exitCode: 0 };
      }),
    },
    git: {
      clone: vi.fn(async () => undefined),
    },
    kill: vi.fn(async () => undefined),
  };
}

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
});
