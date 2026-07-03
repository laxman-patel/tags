"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { normalizeRepoUrls } from "@/lib/github-repo";

export type Space = {
  id: string;
  name: string;
  slug: string;
  externalSpaceId: string;
  organizationId: string;
};

type ActiveConfig = {
  version: number;
  modelId: string;
  reasoning: string;
  instructions: string;
  enabledSkills: string[];
  enabledTools: string[];
  enabledConnections: string[];
  maxSteps: number;
  runtimeMode: string;
  repoUrl?: string | null;
  repoUrls?: string[];
};

export type ConnectionInfo = {
  entityId: string;
  hasComposioApiKey: boolean;
  enabledConnections: string[];
  toolkits: Array<{
    id: string;
    label: string;
    description: string;
    enabled: boolean;
    status: string;
  }>;
};

export type CodebaseRepoInfo = {
  url: string;
  parsedGitHubRepo: { owner: string; repo: string } | null;
};

export type CodebaseInfo = {
  repoUrl: string | null;
  repoUrls: string[];
  repos: CodebaseRepoInfo[];
  hasGlobalGitHubToken: boolean;
  testedRepoUrl?: string | null;
  parsedGitHubRepo?: { owner: string; repo: string } | null;
  result?: {
    ok: boolean;
    status: string;
    message: string;
    private?: boolean;
    defaultBranch?: string | null;
    httpStatus?: number;
  };
};

export type SandboxInfo = {
  hasE2bApiKey: boolean;
  sandbox: null | {
    id: string;
    externalSandboxId: string | null;
    status: "ready" | "leased" | "expired" | "failed";
    activeRunId: string | null;
    leaseExpiresAt: string | null;
    lastUsedAt: string | null;
    template: string;
    repoUrl: string | null;
    workdir: string;
  };
};

type SpaceConfigContextValue = {
  spaceId: string;
  space: Space | null;
  configVersion: number | null;
  modelId: string;
  setModelId: Dispatch<SetStateAction<string>>;
  instructions: string;
  setInstructions: Dispatch<SetStateAction<string>>;
  reasoning: string;
  setReasoning: Dispatch<SetStateAction<string>>;
  maxSteps: number;
  setMaxSteps: Dispatch<SetStateAction<number>>;
  repoUrls: string[];
  setRepoUrls: Dispatch<SetStateAction<string[]>>;
  enabledTools: string[];
  setEnabledTools: Dispatch<SetStateAction<string[]>>;
  enabledConnections: string[];
  setEnabledConnections: Dispatch<SetStateAction<string[]>>;
  connections: ConnectionInfo | null;
  codebase: CodebaseInfo | null;
  sandbox: SandboxInfo | null;
  message: string;
  busy: boolean;
  save: () => Promise<void>;
  saveCodebases: () => Promise<void>;
  connectToolkit: (toolkit: string) => Promise<void>;
  testRepoAccess: (repoUrl?: string) => Promise<void>;
  resetSandbox: () => Promise<void>;
};

const SpaceConfigContext = createContext<SpaceConfigContextValue | null>(null);

export function useSpaceConfig() {
  const value = useContext(SpaceConfigContext);
  if (!value) throw new Error("useSpaceConfig must be used inside SpaceConfigProvider");
  return value;
}

export function SpaceConfigProvider({
  spaceId,
  children,
}: {
  spaceId: string;
  children: ReactNode;
}) {
  const [space, setSpace] = useState<Space | null>(null);
  const [configVersion, setConfigVersion] = useState<number | null>(null);
  const [modelId, setModelId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [reasoning, setReasoning] = useState("provider-default");
  const [maxSteps, setMaxSteps] = useState(12);
  const [repoUrls, setRepoUrls] = useState<string[]>([]);
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [enabledConnections, setEnabledConnections] = useState<string[]>([]);
  const [connections, setConnections] = useState<ConnectionInfo | null>(null);
  const [codebase, setCodebase] = useState<CodebaseInfo | null>(null);
  const [sandbox, setSandbox] = useState<SandboxInfo | null>(null);
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [spaceRes, connectionsRes, codebaseRes, sandboxRes] = await Promise.all([
      fetch(`/api/spaces/${spaceId}`),
      fetch(`/api/spaces/${spaceId}/connections`),
      fetch(`/api/spaces/${spaceId}/codebase`),
      fetch(`/api/spaces/${spaceId}/sandbox`),
    ]);

    const data = await spaceRes.json();
    const activeConfig = data.activeConfig as ActiveConfig | null;
    setSpace(data.space);
    if (activeConfig) {
      setConfigVersion(activeConfig.version);
      setModelId(activeConfig.modelId ?? "");
      setInstructions(activeConfig.instructions ?? "");
      setEnabledTools(activeConfig.enabledTools ?? []);
      setEnabledConnections(activeConfig.enabledConnections ?? []);
      setReasoning(activeConfig.reasoning ?? "provider-default");
      setMaxSteps(activeConfig.maxSteps ?? 12);
      const urls =
        activeConfig.repoUrls?.length
          ? activeConfig.repoUrls
          : activeConfig.repoUrl
            ? [activeConfig.repoUrl]
            : [];
      setRepoUrls(urls);
    }
    setConnections(await connectionsRes.json());
    setCodebase(await codebaseRes.json());
    setSandbox(await sandboxRes.json());
  }, [spaceId]);

  useEffect(() => {
    load().catch(() => setMessage("Failed to load Space"));
  }, [load]);

  async function save() {
    setBusyAction("save");
    try {
      const normalized = normalizeRepoUrls(repoUrls);
      const res = await fetch(`/api/spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modelId,
          instructions,
          enabledTools,
          enabledConnections,
          runtimeMode: "opencode",
          reasoning,
          maxSteps,
          repoUrls: normalized,
        }),
      });
      const data = await res.json();
      setMessage(res.ok ? `Saved config v${data.version}` : data.error ?? "Error saving config");
      if (res.ok) {
        setConfigVersion(data.version);
        await load();
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function saveCodebases() {
    setBusyAction("save-codebases");
    try {
      const normalized = normalizeRepoUrls(repoUrls);
      const res = await fetch(`/api/spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modelId,
          instructions,
          enabledTools,
          enabledConnections,
          runtimeMode: "opencode",
          reasoning,
          maxSteps,
          repoUrls: normalized,
        }),
      });
      const data = await res.json();
      setMessage(res.ok ? `Saved ${normalized.length} codebase(s)` : data.error ?? "Error saving codebases");
      if (res.ok) {
        setConfigVersion(data.version);
        setRepoUrls(normalized);
        await load();
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function connectToolkit(toolkit: string) {
    setBusyAction(`connect:${toolkit}`);
    setMessage("");
    try {
      const res = await fetch(`/api/spaces/${spaceId}/connections/${toolkit}/connect`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Failed to start connection");
      } else if (data.connectUrl) {
        window.open(data.connectUrl, "_blank", "noopener,noreferrer");
        setMessage(`Opened ${toolkit} connection flow`);
      } else {
        setMessage(`Requested ${toolkit} Composio session. No auth URL was returned by the SDK.`);
      }
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  async function testRepoAccess(repoUrl?: string) {
    setBusyAction(repoUrl ? `repo-test:${repoUrl}` : "repo-test");
    try {
      const res = await fetch(`/api/spaces/${spaceId}/codebase`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(repoUrl ? { repoUrl } : {}),
      });
      const data = await res.json();
      setCodebase(data);
      setMessage(data.result?.message ?? "Repo access test complete");
    } finally {
      setBusyAction(null);
    }
  }

  async function resetSandbox() {
    setBusyAction("sandbox-reset");
    try {
      const res = await fetch(`/api/spaces/${spaceId}/sandbox`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force: false }),
      });
      const data = await res.json();
      setMessage(res.ok ? "Sandbox reset" : data.error ?? "Failed to reset sandbox");
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <SpaceConfigContext.Provider
      value={{
        spaceId,
        space,
        configVersion,
        modelId,
        setModelId,
        instructions,
        setInstructions,
        reasoning,
        setReasoning,
        maxSteps,
        setMaxSteps,
        repoUrls,
        setRepoUrls,
        enabledTools,
        setEnabledTools,
        enabledConnections,
        setEnabledConnections,
        connections,
        codebase,
        sandbox,
        message,
        busy: busyAction !== null,
        save,
        saveCodebases,
        connectToolkit,
        testRepoAccess,
        resetSandbox,
      }}
    >
      {children}
    </SpaceConfigContext.Provider>
  );
}
