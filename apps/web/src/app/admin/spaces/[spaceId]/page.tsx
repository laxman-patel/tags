"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { DirectionAwareTabs } from "@/components/ui/direction-aware-tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MinimalCard,
  MinimalCardDescription,
  MinimalCardTitle,
} from "@/components/ui/minimal-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { COMPOSIO_TOOLKITS, NATIVE_TOOLS } from "@/lib/space-options";
import { badgeVariantForTone, statusTone, type StatusTone } from "@/lib/status-badge";

type Space = {
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
};

type ConnectionInfo = {
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

type CodebaseInfo = {
  repoUrl: string | null;
  parsedGitHubRepo: { owner: string; repo: string } | null;
  hasGlobalGitHubToken: boolean;
  result?: {
    ok: boolean;
    status: string;
    message: string;
    private?: boolean;
    defaultBranch?: string | null;
    httpStatus?: number;
  };
};

type SandboxInfo = {
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

const REASONING_OPTIONS = [
  { value: "provider-default", label: "provider default" },
  { value: "none", label: "none" },
  { value: "minimal", label: "minimal" },
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "xhigh" },
] as const;

const TEST_PROMPTS = [
  { label: "tools", code: "@tags what tools and connections do you have access to?" },
  { label: "memory", code: "@tags remember that this channel uses Tags as its channel agent." },
  {
    label: "repo",
    code: "@tags inspect the repo and explain the Slack mention to agent response flow. Do not edit files.",
  },
  {
    label: "artifact",
    code: "@tags create a small channel-notes.md file in the workspace and summarize what changed.",
  },
];

function toggle(list: string[], value: string, enabled: boolean) {
  if (enabled) return list.includes(value) ? list : [...list, value];
  return list.filter((entry) => entry !== value);
}

function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <Badge variant={badgeVariantForTone(tone)}>{children}</Badge>;
}

function FieldValue({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="break-all font-mono text-[13px]">{value || "not set"}</span>
    </div>
  );
}

function Panel(props: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <MinimalCard className={props.className}>
      <div className="p-3">
        <MinimalCardTitle className="mt-0 text-base">{props.title}</MinimalCardTitle>
        {props.description && (
          <MinimalCardDescription className="mt-1 pb-0">
            {props.description}
          </MinimalCardDescription>
        )}
        <div className="mt-4">{props.children}</div>
        {props.footer && <div className="mt-4 flex gap-2">{props.footer}</div>}
      </div>
    </MinimalCard>
  );
}

function ToolRow({
  label,
  description,
  checked,
  onChange,
  badge,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  badge?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-border/60 py-3 first:border-t-0">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {badge && <StatusBadge tone="warning">{badge}</StatusBadge>}
        </div>
        <p className="mt-1 mb-0 text-[13px] leading-snug text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function SpaceDetailPage() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;
  const [space, setSpace] = useState<Space | null>(null);
  const [modelId, setModelId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [enabledConnections, setEnabledConnections] = useState<string[]>([]);
  const [repoUrl, setRepoUrl] = useState("");
  const [reasoning, setReasoning] = useState("provider-default");
  const [maxSteps, setMaxSteps] = useState(12);
  const [configVersion, setConfigVersion] = useState<number | null>(null);
  const [connections, setConnections] = useState<ConnectionInfo | null>(null);
  const [codebase, setCodebase] = useState<CodebaseInfo | null>(null);
  const [sandbox, setSandbox] = useState<SandboxInfo | null>(null);
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function load() {
    if (!spaceId) return;
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
      setRepoUrl(activeConfig.repoUrl ?? "");
    }
    setConnections(await connectionsRes.json());
    setCodebase(await codebaseRes.json());
    setSandbox(await sandboxRes.json());
  }

  useEffect(() => {
    load().catch(() => setMessage("Failed to load Space control panel"));
  }, [spaceId]);

  async function save() {
    const res = await fetch(`/api/spaces/${spaceId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        modelId,
        instructions,
        enabledTools,
        enabledConnections,
        runtimeMode: "opencode",
        reasoning,
        maxSteps,
        repoUrl: repoUrl.trim() || null,
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Saved v${data.version}` : "Error");
    if (res.ok) {
      setConfigVersion(data.version);
      await load();
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

  async function testRepoAccess() {
    setBusyAction("repo-test");
    const res = await fetch(`/api/spaces/${spaceId}/codebase`, { method: "POST" });
    const data = await res.json();
    setCodebase(data);
    setMessage(data.result?.message ?? "Repo access test complete");
    setBusyAction(null);
  }

  async function resetSandbox() {
    setBusyAction("sandbox-reset");
    const res = await fetch(`/api/spaces/${spaceId}/sandbox`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: false }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Sandbox reset" : data.error ?? "Failed to reset sandbox");
    await load();
    setBusyAction(null);
  }

  if (!space) {
    return (
      <main className="mx-auto w-full max-w-[1100px] px-4 py-10">
        <div className="grid gap-3">
          <div className="h-16 w-1/2 animate-pulse rounded-xl bg-neutral-900" />
          <div className="h-64 animate-pulse rounded-[24px] bg-neutral-900" />
        </div>
      </main>
    );
  }

  const overviewTab = (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Channel identity" description="Slack channel boundary for this Space.">
          <div className="grid gap-3">
            <FieldValue label="Name" value={space.name} />
            <FieldValue label="Slug" value={space.slug} />
            <FieldValue label="Slack channel" value={space.externalSpaceId} />
            <FieldValue label="Space ID" value={space.id} />
          </div>
        </Panel>
        <Panel title="Governance" description="Operational controls for this Space.">
          <div className="grid gap-2.5">
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={`/admin/spaces/${spaceId}/memory`}
            >
              Memory
            </Link>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={`/admin/spaces/${spaceId}/usage`}
            >
              Usage
            </Link>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={`/admin/spaces/${spaceId}/schedules`}
            >
              Schedules
            </Link>
            <Link className={buttonVariants({ variant: "outline" })} href="/admin/audit">
              Audit log
            </Link>
          </div>
        </Panel>
      </div>
      <Panel
        title="Test prompts"
        description="Copy these into Slack to verify capabilities after setup."
      >
        <CodeBlock tabs={TEST_PROMPTS} />
      </Panel>
    </div>
  );

  const agentTab = (
    <Panel
      title="Agent config"
      description="Saving changes creates a new active Space config version."
      footer={
        <Button onClick={save} disabled={busyAction !== null}>
          Save new config version
        </Button>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="model">Model</Label>
          <Input id="model" value={modelId} onChange={(e) => setModelId(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="reasoning">Reasoning</Label>
            <Select value={reasoning} onValueChange={(value) => value && setReasoning(value)}>
              <SelectTrigger id="reasoning" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="max-steps">Max steps</Label>
            <Input
              id="max-steps"
              type="number"
              min={1}
              max={40}
              value={maxSteps}
              onChange={(e) => setMaxSteps(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="instructions">Instructions</Label>
          <Textarea
            id="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={10}
          />
        </div>
      </div>
    </Panel>
  );

  const toolsTab = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Panel
        title="Native tools"
        description="Built-in Tags capabilities available to this Space."
      >
        {NATIVE_TOOLS.map((tool) => (
          <ToolRow
            key={tool.id}
            label={tool.label}
            description={tool.description}
            checked={enabledTools.includes(tool.id)}
            badge={tool.id === "run_coding_agent" ? "approval" : undefined}
            onChange={(checked) => setEnabledTools((prev) => toggle(prev, tool.id, checked))}
          />
        ))}
      </Panel>
      <Panel
        title="Composio connections"
        description="Enabled toolkits are exposed to opencode through the Space MCP server."
        footer={
          <Button onClick={save} disabled={busyAction !== null}>
            Save tool access
          </Button>
        }
      >
        <div className="mb-3">
          <StatusBadge tone={connections?.hasComposioApiKey ? "success" : "danger"}>
            {connections?.hasComposioApiKey ? "COMPOSIO_API_KEY configured" : "missing API key"}
          </StatusBadge>
        </div>
        {(connections?.toolkits ?? COMPOSIO_TOOLKITS).map((toolkit) => (
          <div
            key={toolkit.id}
            className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-border/60 py-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{toolkit.label}</span>
                {"status" in toolkit && (
                  <StatusBadge tone={statusTone(String(toolkit.status))}>
                    {String(toolkit.status)}
                  </StatusBadge>
                )}
              </div>
              <p className="mt-1 mb-0 text-[13px] leading-snug text-muted-foreground">
                {toolkit.description}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={enabledConnections.includes(toolkit.id)}
                onCheckedChange={(checked) =>
                  setEnabledConnections((prev) => toggle(prev, toolkit.id, checked))
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => connectToolkit(toolkit.id)}
                disabled={busyAction !== null || !connections?.hasComposioApiKey}
              >
                Connect
              </Button>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );

  const codebaseTab = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Panel
        title="Codebase access"
        description="Repo used by opencode and approved coding runs."
        footer={
          <>
            <Button variant="outline" onClick={testRepoAccess} disabled={busyAction !== null}>
              Test repo access
            </Button>
            <Button onClick={save} disabled={busyAction !== null}>
              Save repo
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="repo-url">Repo URL</Label>
            <Input
              id="repo-url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldValue
              label="Parsed GitHub repo"
              value={
                codebase?.parsedGitHubRepo
                  ? `${codebase.parsedGitHubRepo.owner}/${codebase.parsedGitHubRepo.repo}`
                  : null
              }
            />
            <div>
              <span className="mb-1.5 block text-xs text-muted-foreground">
                Private repo token
              </span>
              <StatusBadge tone={codebase?.hasGlobalGitHubToken ? "success" : "warning"}>
                {codebase?.hasGlobalGitHubToken ? "configured" : "not configured"}
              </StatusBadge>
            </div>
          </div>
          {codebase?.result && (
            <div className="rounded-xl border border-border/60 p-3">
              <StatusBadge tone={statusTone(codebase.result.status)}>
                {codebase.result.status}
              </StatusBadge>
              <p className="mt-2.5 mb-0 text-sm text-muted-foreground">
                {codebase.result.message}
              </p>
              {codebase.result.defaultBranch && (
                <p className="mt-1.5 mb-0 text-sm text-muted-foreground">
                  Default branch: <code>{codebase.result.defaultBranch}</code>
                </p>
              )}
            </div>
          )}
        </div>
      </Panel>
      <Panel
        title="Persistent sandbox"
        description="Live E2B/opencode workspace for this channel."
        footer={
          <Button
            variant="destructive"
            onClick={resetSandbox}
            disabled={busyAction !== null || !sandbox?.sandbox}
          >
            Reset sandbox
          </Button>
        }
      >
        <div className="grid gap-3">
          <div className="flex gap-2">
            <StatusBadge tone={sandbox?.hasE2bApiKey ? "success" : "danger"}>
              {sandbox?.hasE2bApiKey ? "E2B configured" : "E2B missing"}
            </StatusBadge>
            {sandbox?.sandbox && (
              <StatusBadge tone={statusTone(sandbox.sandbox.status)}>
                {sandbox.sandbox.status}
              </StatusBadge>
            )}
          </div>
          {sandbox?.sandbox ? (
            <>
              <FieldValue label="Session ID" value={sandbox.sandbox.id} />
              <FieldValue label="E2B sandbox" value={sandbox.sandbox.externalSandboxId} />
              <FieldValue label="Active run" value={sandbox.sandbox.activeRunId} />
              <FieldValue label="Lease expires" value={sandbox.sandbox.leaseExpiresAt} />
              <FieldValue label="Last used" value={sandbox.sandbox.lastUsedAt} />
              <FieldValue label="Workdir" value={sandbox.sandbox.workdir} />
            </>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">
              No sandbox session exists yet. The first coding run will create one.
            </p>
          )}
        </div>
      </Panel>
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-10">
      <PageHeader
        title={space.name}
        description="Channel tools, code access, and sandbox state for this Space."
        backHref="/admin/spaces"
        backLabel="Spaces"
        actions={
          <>
            <StatusBadge tone="success">opencode harness</StatusBadge>
            {configVersion && <Badge variant="outline">v{configVersion}</Badge>}
          </>
        }
      />

      {message && (
        <div className="mb-4 rounded-xl border border-border bg-neutral-900 px-4 py-2.5 text-sm">
          {message}
        </div>
      )}

      <DirectionAwareTabs
        tabs={[
          { id: 0, label: "Overview", content: overviewTab },
          { id: 1, label: "Agent", content: agentTab },
          { id: 2, label: "Tools", content: toolsTab },
          { id: 3, label: "Codebase & Sandbox", content: codebaseTab },
        ]}
      />
    </main>
  );
}
