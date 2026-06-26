import { createVercelSandboxProvider } from "./vercel-provider";
import type { SandboxProvider } from "./types";

export type SandboxProviderConfig = {
  teamId?: string;
  projectId?: string;
  token?: string;
  defaultRuntime?: string;
};

export function createSandboxProvider(config: SandboxProviderConfig = {}): SandboxProvider {
  return createVercelSandboxProvider(config);
}

export { createVercelSandboxProvider } from "./vercel-provider";
export type {
  SandboxCommandResult,
  SandboxProvider,
  SandboxSession,
} from "./types";
