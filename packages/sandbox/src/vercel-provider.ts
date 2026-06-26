import type { SandboxProvider, SandboxSession } from "./types";

export type SandboxProviderConfig = {
  teamId?: string;
  projectId?: string;
  token?: string;
  defaultRuntime?: string;
};

type VercelSandbox = Awaited<
  ReturnType<(typeof import("@vercel/sandbox"))["Sandbox"]["create"]>
>;

function wrapSandbox(sandbox: VercelSandbox): SandboxSession {
  return {
    id: sandbox.name,
    async runCommand(cmd: string, args: string[] = []) {
      const result = await sandbox.runCommand(cmd, args);
      const stdout = await result.stdout();
      const stderr = await result.stderr();
      return {
        stdout,
        stderr,
        exitCode: result.exitCode,
      };
    },
    async readFile(path: string) {
      return await sandbox.fs.readFile(path, "utf8");
    },
    async stop() {
      await sandbox.stop();
    },
  };
}

export function createSandboxProvider(
  config: SandboxProviderConfig = {},
): SandboxProvider {
  const runtime = config.defaultRuntime ?? "node24";

  return {
    async create(args) {
      const { Sandbox } = await import("@vercel/sandbox");
      const sandbox = await Sandbox.create({
        runtime: args?.runtime ?? runtime,
        teamId: config.teamId,
        projectId: config.projectId,
        token: config.token,
      });
      return wrapSandbox(sandbox);
    },
  };
}
