import { Sandbox } from "e2b";
import type {
  CodingAgentRequest,
  CodingAgentResult,
  OpencodeRunTokenUsage,
  SandboxProvider,
} from "./types";
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
const OPENCODE_AUTH_DIR = "/home/user/.local/share/opencode";
const OPENCODE_AUTH_FILE = `${OPENCODE_AUTH_DIR}/auth.json`;
/** models.dev provider id for Fireworks AI (`opencode auth login --provider fireworks-ai`). */
export const OPENCODE_FIREWORKS_PROVIDER_ID = "fireworks-ai";
export const FIREWORKS_INFERENCE_BASE_URL = "https://api.fireworks.ai/inference/v1";
const TAGS_AGENT_NAME = "tags";

export type SandboxProviderConfig = {
  /** E2B API key. */
  apiKey?: string;
  /**
   * E2B sandbox template. Defaults to the pre-built `opencode` template.
   * Build a custom template with `Template().fromTemplate('opencode')` for faster cold starts.
   */
  template?: string;
  /** Fireworks API key — injected into the sandbox env and opencode provider config. */
  modelApiKey?: string;
  /** opencode `--model` string, e.g. `accounts/fireworks/routers/glm-5p2-fast`. */
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

/** Strip the opencode provider prefix to get the bare Fireworks model path. */
export function bareFireworksModelId(model: string): string {
  return model.startsWith("fireworks-ai/") ? model.slice("fireworks-ai/".length) : model;
}

const FIREWORKS_MODEL_NAMES: Record<string, string> = {
  "accounts/fireworks/routers/glm-5p2-fast": "GLM 5.2 Fast",
};

function fireworksModelDisplayName(bareModelId: string): string {
  const known = FIREWORKS_MODEL_NAMES[bareModelId];
  if (known) return known;

  const slug = bareModelId.split("/").pop() ?? bareModelId;
  return slug
    .split("-")
    .map((part) => (part.length > 0 ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/**
 * Router and other non-catalog Fireworks models must be registered under
 * `provider.fireworks-ai.models` or opencode fails with an opaque UnknownError.
 */
export type OpencodeFireworksProviderConfig = {
  models: Record<string, { name: string }>;
  options?: {
    baseURL: string;
    apiKey: string;
  };
};

export function buildFireworksProviderConfig(
  model: string,
  apiKey?: string,
): Record<string, OpencodeFireworksProviderConfig> | undefined {
  const bareModelId = bareFireworksModelId(model);
  if (!bareModelId.startsWith("accounts/fireworks/")) {
    return undefined;
  }

  return {
    [OPENCODE_FIREWORKS_PROVIDER_ID]: {
      ...(apiKey
        ? {
            options: {
              baseURL: FIREWORKS_INFERENCE_BASE_URL,
              apiKey,
            },
          }
        : {}),
      models: {
        [bareModelId]: {
          name: fireworksModelDisplayName(bareModelId),
        },
      },
    },
  };
}

function sandboxFireworksEnvs(modelApiKey: string): Record<string, string> {
  return { FIREWORKS_API_KEY: modelApiKey };
}

function requireFireworksApiKey(modelApiKey?: string): string {
  const trimmed = modelApiKey?.trim();
  if (!trimmed) {
    throw new Error("FIREWORKS_API_KEY is required for opencode sandbox runs");
  }
  return trimmed;
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

type OpencodeJsonEvent = {
  type: string;
  part?: {
    type?: string;
    text?: string;
    tool?: string;
    reason?: string;
    cost?: number;
    tokens?: {
      input?: number;
      output?: number;
      reasoning?: number;
      cache?: {
        read?: number;
        write?: number;
      };
    };
    state?: {
      status?: string;
      error?: string;
      output?: string;
    };
  };
  error?: {
    name?: string;
    data?: { message?: string };
  };
};

export type { OpencodeRunTokenUsage };

/**
 * Parse token usage from opencode `run --format json` output.
 * Sums every `step_finish` event (including intermediate tool-call steps).
 * Prefers provider-reported `part.cost` when present.
 */
export function extractOpencodeTokenUsage(raw: string): OpencodeRunTokenUsage | null {
  const lines = raw.split("\n");
  let freshInputTokens = 0;
  let cacheWriteTokens = 0;
  let cachedReadTokens = 0;
  let completionTokens = 0;
  let costMicroUsd = 0;
  let hasCost = false;
  let found = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event: OpencodeJsonEvent = JSON.parse(trimmed);
      if (event.type !== "step_finish" || !event.part?.tokens) continue;

      found = true;
      const tokens = event.part.tokens;
      freshInputTokens += tokens.input ?? 0;
      cacheWriteTokens += tokens.cache?.write ?? 0;
      cachedReadTokens += tokens.cache?.read ?? 0;
      completionTokens += tokens.output ?? 0;
      completionTokens += tokens.reasoning ?? 0;

      if (typeof event.part.cost === "number" && event.part.cost > 0) {
        costMicroUsd += Math.round(event.part.cost * 1_000_000);
        hasCost = true;
      }
    } catch {
      // Not JSON — skip.
    }
  }

  if (!found) return null;

  const promptTokens = freshInputTokens + cacheWriteTokens + cachedReadTokens;
  return {
    promptTokens,
    completionTokens,
    freshInputTokens,
    cacheWriteTokens,
    cachedReadTokens,
    costMicroUsd: hasCost ? costMicroUsd : undefined,
    source: "opencode",
  };
}

/** Rough token estimate when opencode JSON usage is unavailable (~4 chars/token). */
export function estimateTokenUsageFromText(
  prompt: string,
  completion: string,
): OpencodeRunTokenUsage {
  const promptTokens = Math.max(0, Math.ceil(prompt.length / 4));
  const completionTokens = Math.max(0, Math.ceil(completion.length / 4));
  return {
    promptTokens,
    completionTokens,
    freshInputTokens: promptTokens,
    cacheWriteTokens: 0,
    cachedReadTokens: 0,
    source: "estimated",
  };
}

/**
 * Parse opencode --format json output and extract only the assistant's final
 * text response. Text emitted before tool calls (e.g. "Let me check the repo…")
 * is narration/preamble and is excluded — only text after the last tool_use
 * event (the actual answer) is kept. Returns null if the output isn't valid
 * JSON events, so callers can fall back to cleanOpencodeReply.
 */
export function extractOpencodeReply(raw: string): string | null {
  const lines = raw.split("\n");
  const textParts: string[] = [];
  let parsedAny = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event: OpencodeJsonEvent = JSON.parse(trimmed);
      parsedAny = true;
      if (event.type === "tool_use") {
        // Discard narration/preamble emitted before tool calls; only text
        // after the last tool_use (the actual answer) is kept.
        textParts.length = 0;
      } else if (event.type === "text" && event.part?.text) {
        textParts.push(event.part.text);
      }
    } catch {
      // Not a JSON line — skip.
    }
  }

  if (!parsedAny) return null;
  return textParts.join("\n\n").trim() || null;
}

/**
 * Convert opencode --format json output to a human-readable format for the DB
 * run timeline and UI cards. Returns null if the output isn't JSON events.
 */
export function formatOpencodeJsonAsReadable(raw: string): string | null {
  const lines = raw.split("\n");
  const parts: string[] = [];
  let parsedAny = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event: OpencodeJsonEvent = JSON.parse(trimmed);
      parsedAny = true;

      if (event.type === "text" && event.part?.text) {
        parts.push(event.part.text);
      } else if (event.type === "tool_use" && event.part) {
        const status = event.part.state?.status;
        if (status === "completed") {
          parts.push(`✓ ${event.part.tool}`);
        } else if (status === "error") {
          const err = event.part.state?.error || "failed";
          parts.push(`✗ ${event.part.tool} failed: ${err}`);
        }
      } else if (event.type === "error" && event.error) {
        const msg = event.error?.data?.message || event.error?.name || "Unknown error";
        parts.push(`❌ ${msg}`);
      }
    } catch {
      if (parsedAny) parts.push(trimmed);
    }
  }

  if (!parsedAny) return null;
  return parts.join("\n").trim() || null;
}

/** Format a single JSON event line for live DB streaming. Returns null to skip. */
function formatJsonLineForStream(line: string): string | null {
  try {
    const event: OpencodeJsonEvent = JSON.parse(line);
    if (event.type === "text" && event.part?.text) {
      return event.part.text;
    }
    if (event.type === "tool_use" && event.part) {
      const status = event.part.state?.status;
      if (status === "completed") return `✓ ${event.part.tool}`;
      if (status === "error") return `✗ ${event.part.tool} failed`;
      return null;
    }
    if (event.type === "error" && event.error) {
      const msg = event.error?.data?.message || event.error?.name || "Error";
      return `❌ ${msg}`;
    }
    return null;
  } catch {
    return line.trim() || null;
  }
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

/** Auth payload written to opencode's credentials file (same shape as `/connect` / `auth login`). */
export function buildOpencodeFireworksAuthJson(
  apiKey: string,
): Record<string, { type: "api"; key: string }> {
  return {
    [OPENCODE_FIREWORKS_PROVIDER_ID]: {
      type: "api",
      key: apiKey,
    },
  };
}

async function ensureOpencodeFireworksAuth(
  sandbox: SandboxInstance,
  apiKey: string,
): Promise<void> {
  const auth = JSON.stringify(buildOpencodeFireworksAuthJson(apiKey), null, 2);
  await sandbox.commands.run(
    `mkdir -p ${shellQuote(OPENCODE_AUTH_DIR)} && cat > ${shellQuote(OPENCODE_AUTH_FILE)} <<'EOF'\n${auth}\nEOF && chmod 600 ${shellQuote(OPENCODE_AUTH_FILE)}`,
  );
}

async function writeOpencodeConfig(
  sandbox: SandboxInstance,
  request: CodingAgentRequest,
  model: string,
  modelApiKey?: string,
): Promise<string | undefined> {
  const hasMcpServers = request.mcpServers && Object.keys(request.mcpServers).length > 0;
  const systemPrompt = request.systemPrompt?.trim();
  const provider = buildFireworksProviderConfig(model, modelApiKey);

  if (!hasMcpServers && !systemPrompt && !provider) {
    return undefined;
  }

  const opencodeConfig: {
    $schema: string;
    agent?: Record<string, { mode: "primary"; prompt: string }>;
    mcp?: CodingAgentRequest["mcpServers"];
    provider?: Record<string, OpencodeFireworksProviderConfig>;
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

  if (provider) {
    opencodeConfig.provider = provider;
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

type PreparedOpencodeRun = {
  opencodeConfigPath?: string;
  command: string;
};

/** Apply Fireworks credentials to any sandbox before every opencode invocation. */
export async function prepareOpencodeFireworksRun(
  sandbox: SandboxInstance,
  args: {
    modelApiKey: string;
    request: CodingAgentRequest;
    model: string;
  },
): Promise<PreparedOpencodeRun> {
  const modelApiKey = requireFireworksApiKey(args.modelApiKey);
  await ensureOpencodeFireworksAuth(sandbox, modelApiKey);
  const opencodeConfigPath = await writeOpencodeConfig(
    sandbox,
    args.request,
    args.model,
    modelApiKey,
  );
  const agentFlag = args.request.systemPrompt?.trim()
    ? ` --agent ${shellQuote(TAGS_AGENT_NAME)}`
    : "";
  const command = `FIREWORKS_API_KEY=${shellQuote(modelApiKey)} ${opencodeConfigPath ? `OPENCODE_CONFIG=${shellQuote(opencodeConfigPath)} ` : ""}opencode run${agentFlag} --format json --model ${shellQuote(args.model)} ${shellQuote(args.request.prompt)}`;
  return { opencodeConfigPath, command };
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
  const fireworksApiKey = requireFireworksApiKey(config.modelApiKey);

  return {
    async runCodingAgent(request: CodingAgentRequest): Promise<CodingAgentResult> {
      const sandboxOptions = {
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs ?? 10 * 60_000,
        envs: sandboxFireworksEnvs(fireworksApiKey),
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
      let lineBuffer = "";

      try {
        const { cwd, repoPaths } = await ensureWorkspace(sandbox, request, config);
        const model = toOpencodeModelId(
          request.model ?? config.model ?? "accounts/fireworks/routers/glm-5p2-fast",
        );
        const { command } = await prepareOpencodeFireworksRun(sandbox, {
          modelApiKey: fireworksApiKey,
          request,
          model,
        });

        const appendStream = async (chunk: string) => {
          const clean = stripAnsi(chunk);
          streamed += clean;
          if (request.onOutput && clean) {
            lineBuffer += clean;
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const formatted = formatJsonLineForStream(line);
              if (formatted) {
                await request.onOutput(formatted + "\n");
              }
            }
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

        // Flush remaining line buffer to onOutput.
        if (lineBuffer.trim() && request.onOutput) {
          const formatted = formatJsonLineForStream(lineBuffer);
          if (formatted) {
            await request.onOutput(formatted + "\n");
          }
        }

        // Parse --format json output: extract reply text and convert to readable
        // format for the DB timeline / UI cards. Falls back to raw output if not JSON.
        const tokenUsage = extractOpencodeTokenUsage(output);
        const replyText = extractOpencodeReply(output);
        const readable = formatOpencodeJsonAsReadable(output);
        if (readable) {
          output = readable;
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
          ...(replyText ? { replyText } : {}),
          ...(tokenUsage ? { tokenUsage } : {}),
        };
      } finally {
        if (!request.session?.keepAlive || (createdSandbox && !completed)) {
          await sandbox.kill();
        }
      }
    },
  };
}
