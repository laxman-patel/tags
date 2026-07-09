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
  /**
   * Called as soon as the sandbox is connected/created, before opencode starts.
   * Used so mid-run tools like `record_proof` can reconnect to the live box.
   */
  onSandboxReady?: (info: {
    sandboxId: string;
    createdSandbox: boolean;
    reusedSandbox: boolean;
  }) => void | Promise<void>;
}

/** Browser interaction step for in-sandbox proof recording. */
export type ProofStep =
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

export type ProofJourney = {
  name: string;
  steps: ProofStep[];
};

export type ProofRecordingRequest = {
  /** Already-connected desktop sandbox (do not kill). */
  sandbox: ProofSandbox;
  baseUrl: string;
  journeys: ProofJourney[];
  maxSeconds: number;
  width: number;
  height: number;
  fps: number;
  filenameHint?: string;
};

export type ProofJourneyResult = {
  name: string;
  ok: boolean;
  error?: string;
};

export type ProofRecordingResult = {
  video: Buffer;
  filename: string;
  contentType: "video/mp4";
  durationMs: number;
  journeys: ProofJourneyResult[];
  logs: string;
};

/** Minimal sandbox surface used by the proof recorder. */
export type ProofSandbox = {
  sandboxId: string;
  commands: {
    run: (
      command: string,
      options?: {
        cwd?: string;
        timeoutMs?: number;
        envs?: Record<string, string>;
        background?: boolean;
      },
    ) => Promise<{ stdout?: string; stderr?: string; exitCode?: number }>;
  };
  files?: {
    read: (path: string, opts: { format: "bytes" }) => Promise<Uint8Array>;
    write: (path: string, data: string) => Promise<unknown>;
  };
  setTimeout?: (timeoutMs: number) => Promise<void>;
};

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
