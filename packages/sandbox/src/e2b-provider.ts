import { Sandbox } from "e2b";
import type { CodingAgentRequest, CodingAgentResult, SandboxProvider } from "./types";
import {
  extractGitHubPrUrl,
  parseTagsRunOutputJson,
} from "./run-output";

/** E2B pre-built template with opencode installed (see e2b.dev/docs/agents/opencode). */
export const DEFAULT_OPENCODE_TEMPLATE = "opencode";

export const REPO_PATH = "/home/user/repo";
export const WORKDIR = "/home/user/workspace";
export const REPOS_ROOT = "/home/user/repos";
const OPENCODE_CONFIG_PATH = "/tmp/tags/opencode.json";
const TAGS_AGENT_NAME = "tags";

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

function mergeRunOutputFromText(
  existing: CodingAgentResult["runOutput"],
  output: string,
): CodingAgentResult["runOutput"] {
  if (existing?.prUrl) return existing;
  const prUrl = extractGitHubPrUrl(output);
  if (!prUrl) return existing;
  return { ...existing, prUrl };
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

function safeRepoName(repoUrl: string): string {
  const match = repoUrl.match(/[^/]+\/[^/.]+(?:\.git)?\/?$/);
  if (match) {
    return match[0].replace(/\.git\/?$/, "").replace(/[^a-zA-Z0-9_-]/g, "-");
  }
  return `repo-${Math.abs(hashString(repoUrl)) % 100000}`;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

async function ensureWorkspace(
  sandbox: SandboxInstance,
  request: CodingAgentRequest,
  config: SandboxProviderConfig,
): Promise<{ cwd: string; repoPaths: Record<string, string> }> {
  const repoUrls = request.repoUrls?.length
    ? request.repoUrls
    : request.repoUrl
      ? [request.repoUrl]
      : [];

  if (repoUrls.length === 0) {
    await sandbox.commands.run(`mkdir -p ${shellQuote(WORKDIR)}`);
    return { cwd: WORKDIR, repoPaths: {} };
  }

  // Single-repo backwards compatibility: use REPO_PATH directly.
  if (repoUrls.length === 1 && !request.repoUrls) {
    const repoUrl = repoUrls[0]!;
    const hasRepo = await pathExists(sandbox, `${REPO_PATH}/.git`);
    if (!hasRepo) {
      await sandbox.commands.run(`rm -rf ${shellQuote(REPO_PATH)}`);
      await sandbox.git.clone(repoUrl, {
        path: REPO_PATH,
        depth: 1,
      });
    }
    return { cwd: REPO_PATH, repoPaths: { [repoUrl]: REPO_PATH } };
  }

  // Multi-repo: clone each into REPOS_ROOT/<safe-name>.
  await sandbox.commands.run(`mkdir -p ${shellQuote(REPOS_ROOT)}`);
  const repoPaths: Record<string, string> = {};

  for (const url of repoUrls) {
    const name = safeRepoName(url);
    const path = `${REPOS_ROOT}/${name}`;
    const hasRepo = await pathExists(sandbox, `${path}/.git`);
    if (!hasRepo) {
      await sandbox.commands.run(`rm -rf ${shellQuote(path)}`);
      await sandbox.git.clone(url, {
        path,
        depth: 1,
      });
    }
    repoPaths[url] = path;
  }

  return { cwd: REPOS_ROOT, repoPaths };
}

async function writeOpencodeConfig(
  sandbox: SandboxInstance,
  request: CodingAgentRequest,
): Promise<string | undefined> {
  const hasMcpServers = request.mcpServers && Object.keys(request.mcpServers).length > 0;
  const systemPrompt = request.systemPrompt?.trim();

  if (!hasMcpServers && !systemPrompt) {
    return undefined;
  }

  const opencodeConfig: {
    $schema: string;
    agent?: Record<string, { mode: "primary"; prompt: string }>;
    mcp?: CodingAgentRequest["mcpServers"];
  } = {
    $schema: "https://opencode.ai/config.json",
  };

  if (systemPrompt) {
    opencodeConfig.agent = {
      [TAGS_AGENT_NAME]: {
        mode: "primary",
        prompt: systemPrompt,
      },
    };
  }

  if (hasMcpServers) {
    opencodeConfig.mcp = request.mcpServers;
  }

  const config = JSON.stringify(
    opencodeConfig,
    null,
    2,
  );

  await sandbox.commands.run(
    `mkdir -p ${shellQuote("/tmp/tags")} && cat > ${shellQuote(OPENCODE_CONFIG_PATH)} <<'EOF'\n${config}\nEOF`,
  );

  return OPENCODE_CONFIG_PATH;
}

async function readRunOutput(
  sandbox: SandboxInstance,
  repoPaths: Record<string, string>,
): Promise<CodingAgentResult["runOutput"]> {
  for (const repoPath of Object.values(repoPaths)) {
    try {
      const result = await sandbox.commands.run("cat .tags/run-output.json", { cwd: repoPath });
      const parsed = parseTagsRunOutputJson(combineOutput(result));
      if (parsed) return parsed;
    } catch {
      // Optional metadata file. Ignore malformed or missing output.
    }
  }
  return undefined;
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
        const { cwd, repoPaths } = await ensureWorkspace(sandbox, request, config);
        const opencodeConfigPath = await writeOpencodeConfig(sandbox, request);
        const model = toOpencodeModelId(
          request.model ?? config.model ?? "accounts/fireworks/routers/glm-5p2-fast",
        );
        const agentFlag = request.systemPrompt?.trim()
          ? ` --agent ${shellQuote(TAGS_AGENT_NAME)}`
          : "";
        const command = `${opencodeConfigPath ? `OPENCODE_CONFIG=${shellQuote(opencodeConfigPath)} ` : ""}opencode run${agentFlag} --model ${shellQuote(model)} ${shellQuote(request.prompt)}`;

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
        const repoUrls = request.repoUrls?.length
          ? request.repoUrls
          : request.repoUrl
            ? [request.repoUrl]
            : [];
        if (repoUrls.length > 0) {
          const diffs: string[] = [];
          for (const url of repoUrls) {
            const repoPath = repoPaths[url];
            if (!repoPath) continue;
            try {
              const diffResult = await sandbox.commands.run("git diff", { cwd: repoPath });
              const diff = combineOutput(diffResult);
              if (diff) {
                diffs.push(`--- ${safeRepoName(url)} ---\n${diff}`);
              }
            } catch {
              // Non-fatal: opencode output is still useful without diff.
            }
          }
          if (diffs.length > 0) {
            gitDiff = diffs.join("\n\n");
            output = `${output}\n\n--- git diff ---\n${gitDiff}`;
          }
        }

        const fileRunOutput = await readRunOutput(sandbox, repoPaths);
        const runOutput = mergeRunOutputFromText(fileRunOutput, output);

        completed = true;
        return {
          sandboxId: sandbox.sandboxId,
          createdSandbox,
          reusedSandbox,
          exitCode,
          output,
          gitDiff,
          repoPaths: Object.keys(repoPaths).length > 0 ? repoPaths : undefined,
          runOutput,
        };
      } finally {
        if (!request.session?.keepAlive || (createdSandbox && !completed)) {
          await sandbox.kill();
        }
      }
    },
  };
}
