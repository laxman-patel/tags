import { Sandbox } from "e2b";
import type { CodingAgentRequest, CodingAgentResult, SandboxProvider } from "./types";

export type SandboxProviderConfig = {
  /** E2B API key. */
  apiKey?: string;
  /**
   * E2B template to launch. Defaults to E2B's `base` image; opencode is then
   * installed at runtime. Use a custom template with opencode preinstalled to
   * avoid the per-run install cost.
   */
  template?: string;
  /** Fireworks API key opencode uses for inference inside the sandbox. */
  modelApiKey?: string;
  /** opencode model string, e.g. "fireworks/accounts/fireworks/models/...". */
  model?: string;
  /** Max sandbox lifetime in ms. */
  timeoutMs?: number;
};

const WORKDIR = "/home/user/workspace";

/**
 * opencode reads provider config from the `OPENCODE_CONFIG_CONTENT` env var.
 * We register Fireworks as an OpenAI-compatible provider so opencode can use it.
 * The exact model slug/provider wiring may need tuning against a live run.
 */
function opencodeConfigContent(modelApiKey: string): string {
  return JSON.stringify({
    provider: {
      fireworks: {
        npm: "@ai-sdk/openai-compatible",
        options: {
          baseURL: "https://api.fireworks.ai/inference/v1",
          apiKey: modelApiKey,
        },
      },
    },
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

type CommandLike = { stdout?: string; stderr?: string; exitCode?: number };

function combineOutput(result: CommandLike): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}

export function createSandboxProvider(config: SandboxProviderConfig = {}): SandboxProvider {
  const model =
    config.model ?? "fireworks/accounts/fireworks/models/kimi-k2-instruct";

  return {
    async runCodingAgent(request: CodingAgentRequest): Promise<CodingAgentResult> {
      const envs: Record<string, string> = {};
      if (config.modelApiKey) {
        envs.FIREWORKS_API_KEY = config.modelApiKey;
        envs.OPENCODE_CONFIG_CONTENT = opencodeConfigContent(config.modelApiKey);
      }

      const sandbox = await Sandbox.create({
        apiKey: config.apiKey,
        template: config.template,
        timeoutMs: config.timeoutMs ?? 10 * 60_000,
        envs,
      });

      try {
        await sandbox.commands.run(`mkdir -p ${WORKDIR}`);

        if (request.repoUrl) {
          await sandbox.commands.run(
            `git clone --depth 1 ${shellQuote(request.repoUrl)} ${WORKDIR}/repo`,
            { timeoutMs: 5 * 60_000 },
          );
        }

        // No-op when the template already ships opencode.
        await sandbox.commands.run("command -v opencode || npm install -g opencode-ai", {
          timeoutMs: 5 * 60_000,
        });

        const cwd = request.repoUrl ? `${WORKDIR}/repo` : WORKDIR;
        const command = `opencode run --model ${shellQuote(model)} ${shellQuote(request.prompt)}`;

        try {
          const result = await sandbox.commands.run(command, { cwd, timeoutMs: 8 * 60_000 });
          return {
            sandboxId: sandbox.sandboxId,
            exitCode: result.exitCode,
            output: combineOutput(result),
          };
        } catch (error) {
          // E2B rejects on a non-zero exit; surface the captured output instead of throwing.
          const e = error as CommandLike;
          if (e && (e.stdout !== undefined || e.stderr !== undefined || e.exitCode !== undefined)) {
            return {
              sandboxId: sandbox.sandboxId,
              exitCode: e.exitCode ?? 1,
              output: combineOutput(e),
            };
          }
          throw error;
        }
      } finally {
        await sandbox.kill();
      }
    },
  };
}
