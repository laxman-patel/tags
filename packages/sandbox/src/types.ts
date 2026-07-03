export interface CodingAgentRequest {
  /** Natural-language coding task for the opencode agent to perform. */
  prompt: string;
  /** Optional opencode agent prompt. Use this for higher-priority harness instructions. */
  systemPrompt?: string;
  /** Optional git repository to clone into the sandbox before running. */
  repoUrl?: string;
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

export interface CodingAgentResult {
  sandboxId: string;
  createdSandbox: boolean;
  reusedSandbox: boolean;
  exitCode: number;
  /** Combined stdout/stderr from the opencode run. */
  output: string;
  /** `git diff` after the run when `repoUrl` was provided. */
  gitDiff?: string;
}

export interface SandboxProvider {
  /** Runs the opencode coding agent in an isolated E2B sandbox. */
  runCodingAgent(request: CodingAgentRequest): Promise<CodingAgentResult>;
}
