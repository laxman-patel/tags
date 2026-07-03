import { Sandbox } from "e2b";
import type { CodingAgentRequest, CodingAgentResult, SandboxProvider } from "./types";

/** E2B pre-built template with opencode installed (see e2b.dev/docs/agents/opencode). */
export const DEFAULT_OPENCODE_TEMPLATE = "opencode";

export const REPO_PATH = "/home/user/repo";
export const WORKDIR = "/home/user/workspace";

export type SandboxProviderConfig = {
  /** E2B API key. */
  apiKey?: string;
  /**
   * E2B sandbox template. Defaults to the pre-built `opencode` template.
   * Build a custom template with `Template().fromTemplate('opencode')` for faster cold starts.
   */
  template?: string;
  /** Fireworks API key — passed as `FIREWORKS_API_KEY` for opencode (see opencode.ai/docs/config). */
  modelApiKey?: string;
  /** Optional GitHub token for private `repoUrl` clones (`x-access-token`). */
  githubToken?: string;
  /** opencode `--model` string, e.g. `accounts/fireworks/models/kimi-k2-instruct`. */
  model?: string;
  /** Max sandbox lifetime in ms. */
  timeoutMs?: number;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * opencode expects `provider/model` ids (e.g. `fireworks-ai/accounts/fireworks/models/glm-5p2`),
 * while the rest of Tags stores bare Fireworks ids (`accounts/fireworks/...`). Passing a bare id
 * makes opencode treat `accounts` as the provider and fail with an opaque UnknownError.
 */
export function toOpencodeModelId(model: string): string {
  return model.startsWith("accounts/") ? `fireworks-ai/${model}` : model;
}

type CommandLike = { stdout?: string; stderr?: string; exitCode?: number };
type SandboxInstance = Awaited<ReturnType<typeof Sandbox.create>>;
type SandboxConstructor = typeof Sandbox & {
  connect?: (
    sandboxId: string,
    options?: {
      apiKey?: string;
      timeoutMs?: number;
      envs?: Record<string, string>;
    },
  ) => Promise<SandboxInstance>;
};

/** opencode writes terminal color codes; strip them so Slack/DB output stays readable. */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

function combineOutput(result: CommandLike): string {
  return stripAnsi(`${result.stdout ?? ""}\n${result.stderr ?? ""}`).trim();
}

async function connectSandbox(
  sandboxId: string,
  options: {
    apiKey?: string;
    timeoutMs?: number;
    envs?: Record<string, string>;
  },
): Promise<SandboxInstance> {
  const connect = (Sandbox as SandboxConstructor).connect;
  if (!connect) {
    throw new Error("Installed E2B SDK does not support reconnecting to sandboxes");
  }
  return connect(sandboxId, options);
}

async function pathExists(sandbox: SandboxInstance, path: string): Promise<boolean> {
  try {
    await sandbox.commands.run(`test -e ${shellQuote(path)}`);
    return true;
  } catch {
    return false;
  }
}

async function ensureWorkspace(
  sandbox: SandboxInstance,
  request: CodingAgentRequest,
  config: SandboxProviderConfig,
): Promise<string> {
  if (!request.repoUrl) {
    await sandbox.commands.run(`mkdir -p ${shellQuote(WORKDIR)}`);
    return WORKDIR;
  }

  const hasRepo = await pathExists(sandbox, `${REPO_PATH}/.git`);
  if (!hasRepo) {
    await sandbox.commands.run(`rm -rf ${shellQuote(REPO_PATH)}`);
    await sandbox.git.clone(request.repoUrl, {
      path: REPO_PATH,
      depth: 1,
      ...(config.githubToken
        ? { username: "x-access-token", password: config.githubToken }
        : {}),
    });
  }

  return REPO_PATH;
}

export function createSandboxProvider(config: SandboxProviderConfig = {}): SandboxProvider {
  const template = config.template ?? DEFAULT_OPENCODE_TEMPLATE;

  return {
    async runCodingAgent(request: CodingAgentRequest): Promise<CodingAgentResult> {
      const envs: Record<string, string> = {};
      if (config.modelApiKey) {
        envs.FIREWORKS_API_KEY = config.modelApiKey;
      }

      const sandboxOptions = {
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs ?? 10 * 60_000,
        envs,
      };

      let createdSandbox = false;
      let reusedSandbox = false;
      let sandbox: SandboxInstance | null = null;

      if (request.session?.sandboxId) {
        try {
          sandbox = await connectSandbox(request.session.sandboxId, sandboxOptions);
          reusedSandbox = true;
        } catch {
          sandbox = null;
        }
      }

      if (!sandbox) {
        sandbox = await Sandbox.create(template, sandboxOptions);
        createdSandbox = true;
      }

      let streamed = "";
      let completed = false;

      try {
        const cwd = await ensureWorkspace(sandbox, request, config);
        const model = toOpencodeModelId(
          request.model ?? config.model ?? "accounts/fireworks/routers/glm-5p2-fast",
        );
        const command = `opencode run --model ${shellQuote(model)} ${shellQuote(request.prompt)}`;

        const appendStream = async (chunk: string) => {
          const clean = stripAnsi(chunk);
          streamed += clean;
          if (request.onOutput && clean) {
            await request.onOutput(clean);
          }
        };

        let exitCode = 0;
        let output = "";

        try {
          const result = await sandbox.commands.run(command, {
            cwd,
            timeoutMs: 8 * 60_000,
            onStdout: (data) => appendStream(data),
            onStderr: (data) => appendStream(data),
          });
          exitCode = result.exitCode;
          output = combineOutput(result) || streamed;
        } catch (error) {
          const e = error as CommandLike;
          if (e && (e.stdout !== undefined || e.stderr !== undefined || e.exitCode !== undefined)) {
            exitCode = e.exitCode ?? 1;
            output = combineOutput(e) || streamed;
          } else {
            throw error;
          }
        }

        let gitDiff: string | undefined;
        if (request.repoUrl) {
          try {
            const diffResult = await sandbox.commands.run("git diff", { cwd: REPO_PATH });
            gitDiff = combineOutput(diffResult);
            if (gitDiff) {
              output = `${output}\n\n--- git diff ---\n${gitDiff}`;
            }
          } catch {
            // Non-fatal: opencode output is still useful without diff.
          }
        }

        completed = true;
        return {
          sandboxId: sandbox.sandboxId,
          createdSandbox,
          reusedSandbox,
          exitCode,
          output,
          gitDiff,
        };
      } finally {
        if (!request.session?.keepAlive || (createdSandbox && !completed)) {
          await sandbox.kill();
        }
      }
    },
  };
}
