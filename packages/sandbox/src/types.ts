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
}

export type DemoStep =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string }
  | { type: "fill"; selector: string; value: string }
  | { type: "press"; key: string }
  | { type: "waitForSelector"; selector: string; timeoutMs?: number }
  | { type: "waitForText"; text: string; timeoutMs?: number }
  | { type: "waitMs"; ms: number }
  | { type: "assertText"; text: string };

export type DemoRecipe =
  | {
      kind: "web";
      repoSubdir?: string;
      installCommand?: string;
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

export type TagsRunOutput = {
  prUrl?: string;
  repoUrl?: string;
  branch?: string;
  commitSha?: string;
  demo?: DemoRecipe;
};

export interface CodingAgentResult {
  sandboxId: string;
  createdSandbox: boolean;
  reusedSandbox: boolean;
  exitCode: number;
  /** Combined stdout/stderr from the opencode run. */
  output: string;
  /** `git diff` after the run when `repoUrl` was provided. */
  gitDiff?: string;
  /** Map of repo URL -> checkout path inside the sandbox. */
  repoPaths?: Record<string, string>;
  /** Structured run metadata written by opencode to `.tags/run-output.json`. */
  runOutput?: TagsRunOutput;
}

export interface SandboxProvider {
  /** Runs the opencode coding agent in an isolated E2B sandbox. */
  runCodingAgent(request: CodingAgentRequest): Promise<CodingAgentResult>;
}
