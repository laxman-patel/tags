export interface CodingAgentRequest {
  /** Natural-language coding task for the opencode agent to perform. */
  prompt: string;
  /** Optional opencode agent prompt. Use this for higher-priority harness instructions. */
  systemPrompt?: string;
  /** Optional git repository to clone into the sandbox before running. Legacy single-repo. */
  repoUrl?: string;
  /** Multiple git repositories to clone into the sandbox. When set, takes precedence over repoUrl. */
  repoUrls?: string[];
  /** opencode `--model` override for this run (falls back to provider config). */
  model?: string;
  /** Existing sandbox session to reuse. When keepAlive is true, the sandbox is not killed. */
  session?: {
    sandboxId?: string | null;
    keepAlive: boolean;
  };
  /** Remote MCP servers exposed to opencode for this run. */
  mcpServers?: Record<
    string,
    {
      type: "remote";
      url: string;
      enabled?: boolean;
      headers?: Record<string, string>;
      timeout?: number;
    }
  >;
  /** Live opencode CLI output (E2B `onStdout` / `onStderr`). */
  onOutput?: (chunk: string) => void | Promise<void>;
  /** Short human step for Slack while opencode is working (e.g. "Cloning the repo"). */
  onProgress?: (step: string) => void | Promise<void>;
}

export type DemoStep =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string }
  | { type: "fill"; selector: string; value: string }
  | { type: "press"; key: string }
  | { type: "waitForSelector"; selector: string; timeoutMs?: number }
  | { type: "waitForText"; text: string; timeoutMs?: number }
  | { type: "waitMs"; ms: number }
  | { type: "assertText"; text: string }
  /** Wait until the current page URL matches (substring or regex source). */
  | { type: "waitForUrl"; url: string; timeoutMs?: number }
  /** Assert the current page URL contains this substring (or matches regex). */
  | { type: "assertUrl"; url: string };

export type DemoRecipe =
  | {
      kind: "web";
      repoSubdir?: string;
      installCommand?: string;
      /** Skip dependency install when node_modules are already present / deps unchanged. */
      skipInstall?: boolean;
      startCommand: string;
      readyUrl: string;
      readyTimeoutMs?: number;
      steps: DemoStep[];
      successText?: string;
    }
  | {
      kind: "terminal";
      repoSubdir?: string;
      command: string;
    }
  | { kind: "none"; reason: string };

export type OpencodeRunTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  freshInputTokens: number;
  cacheWriteTokens: number;
  cachedReadTokens: number;
  /** Sum of opencode step_finish part.cost converted to micro-USD. */
  costMicroUsd?: number;
  source: "opencode" | "estimated";
};

export type TagsRunOutput = {
  prUrl?: string;
  repoUrl?: string;
  branch?: string;
  commitSha?: string;
  demo?: DemoRecipe;
};

export type DemoRecordingRequest = {
  apiKey?: string;
  template: string;
  repoUrl: string;
  branch?: string;
  /** Exact PR head SHA — preferred over branch tip when present. */
  commitSha?: string;
  demo: DemoRecipe;
  maxSeconds: number;
  width: number;
  height: number;
  fps: number;
  /** Original Slack trigger — used to reject terminal cheats / weak web recipes. */
  triggerText?: string;
};

export type DemoRecordingResult = {
  video: Buffer;
  filename: string;
  contentType: "video/mp4";
  durationMs: number;
  logs: string;
};

export interface CodingAgentResult {
  sandboxId: string;
  createdSandbox: boolean;
  reusedSandbox: boolean;
  exitCode: number;
  /** Combined stdout/stderr from the opencode run. */
  output: string;
  /** Only the assistant's text response, extracted from --format json. */
  replyText?: string;
  /** `git diff` after the run when `repoUrl` was provided. */
  gitDiff?: string;
  /** Map of repo URL -> checkout path inside the sandbox. */
  repoPaths?: Record<string, string>;
  /** Structured run metadata written by opencode to `.tags/run-output.json`. */
  runOutput?: TagsRunOutput;
  /** Token usage parsed from opencode `--format json` step_finish events. */
  tokenUsage?: OpencodeRunTokenUsage;
}

export interface SandboxProvider {
  /** Runs the opencode coding agent in an isolated E2B sandbox. */
  runCodingAgent(request: CodingAgentRequest): Promise<CodingAgentResult>;
}
