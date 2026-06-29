export interface CodingAgentRequest {
  /** Natural-language coding task for the opencode agent to perform. */
  prompt: string;
  /** Optional git repository to clone into the sandbox before running. */
  repoUrl?: string;
}

export interface CodingAgentResult {
  sandboxId: string;
  exitCode: number;
  /** Combined stdout/stderr from the opencode run. */
  output: string;
}

export interface SandboxProvider {
  /** Runs the opencode coding agent in an isolated E2B sandbox. */
  runCodingAgent(request: CodingAgentRequest): Promise<CodingAgentResult>;
}
