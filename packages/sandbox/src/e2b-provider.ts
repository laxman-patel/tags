import { Sandbox } from "e2b";
import type { CodingAgentRequest, CodingAgentResult, SandboxProvider } from "./types";

/** E2B pre-built template with opencode installed (see e2b.dev/docs/agents/opencode). */
export const DEFAULT_OPENCODE_TEMPLATE = "opencode";

const REPO_PATH = "/home/user/repo";
const WORKDIR = "/home/user/workspace";

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

type CommandLike = { stdout?: string; stderr?: string; exitCode?: number };

function combineOutput(result: CommandLike): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}

export function createSandboxProvider(config: SandboxProviderConfig = {}): SandboxProvider {
  const template = config.template ?? DEFAULT_OPENCODE_TEMPLATE;

  return {
    async runCodingAgent(request: CodingAgentRequest): Promise<CodingAgentResult> {
      const envs: Record<string, string> = {};
      if (config.modelApiKey) {
        envs.FIREWORKS_API_KEY = config.modelApiKey;
      }

      const sandbox = await Sandbox.create(template, {
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs ?? 10 * 60_000,
        envs,
      });

      let streamed = "";

      try {
        if (request.repoUrl) {
          await sandbox.git.clone(request.repoUrl, {
            path: REPO_PATH,
            depth: 1,
            ...(config.githubToken
              ? { username: "x-access-token", password: config.githubToken }
              : {}),
          });
        } else {
          await sandbox.commands.run(`mkdir -p ${WORKDIR}`);
        }

        const cwd = request.repoUrl ? REPO_PATH : WORKDIR;
        const model = request.model ?? config.model ?? "accounts/fireworks/models/kimi-k2-instruct";
        const command = `opencode run --model ${shellQuote(model)} ${shellQuote(request.prompt)}`;

        const appendStream = async (chunk: string) => {
          streamed += chunk;
          if (request.onOutput) {
            await request.onOutput(chunk);
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

        return {
          sandboxId: sandbox.sandboxId,
          exitCode,
          output,
          gitDiff,
        };
      } finally {
        await sandbox.kill();
      }
    },
  };
}
