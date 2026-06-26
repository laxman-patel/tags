export interface SandboxCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SandboxSession {
  id: string;
  runCommand(cmd: string, args?: string[]): Promise<SandboxCommandResult>;
  readFile(path: string): Promise<string>;
  stop(): Promise<void>;
}

export interface SandboxProvider {
  create(args?: { runtime?: string }): Promise<SandboxSession>;
}
