"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { COMPOSIO_TOOLKITS, NATIVE_TOOLS } from "@/lib/space-options";

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
  runtimeMode: "opencode" | "orchestrator";
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

const runtimeCopy = {
  opencode: "Coding-first. Uses the persistent E2B/opencode sandbox. Composio tools are not loaded on this path yet.",
  orchestrator:
    "Tool-first. Loads native and Composio tools; coding runs through the approved run_coding_agent tool.",
};

function toggle(list: string[], value: string, enabled: boolean) {
  if (enabled) return list.includes(value) ? list : [...list, value];
  return list.filter((entry) => entry !== value);
}

function statusTone(status: string): "default" | "success" | "warning" | "danger" {
  if (["ready", "enabled", "reachable", "success"].includes(status)) return "success";
  if (["leased", "available", "missing_api_key"].includes(status)) return "warning";
  if (["failed", "expired", "not_found_or_no_access", "request_failed"].includes(status)) {
    return "danger";
  }
  return "default";
}

function FieldValue({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <span className="mono" style={{ fontSize: 13, wordBreak: "break-all" }}>
        {value || "not set"}
      </span>
    </div>
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "12px 0",
        borderTop: "1px solid rgb(255 255 255 / 0.06)",
      }}
    >
      <div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <strong style={{ fontSize: 14 }}>{label}</strong>
          {badge && <Badge tone="warning">{badge}</Badge>}
        </div>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.4 }}>
          {description}
        </p>
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
  const [runtimeMode, setRuntimeMode] = useState<"opencode" | "orchestrator">("opencode");
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
      setRuntimeMode(activeConfig.runtimeMode === "orchestrator" ? "orchestrator" : "opencode");
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
        runtimeMode,
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

  if (!space) return <main className="admin-shell">Loading…</main>;

  return (
    <main className="admin-shell">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
        <div>
          <p className="muted" style={{ margin: "0 0 10px" }}>
            <Link href="/admin/spaces">Spaces</Link> / <span>{space.name}</span>
          </p>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.04em" }}>
            Space control panel
          </h1>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            Minimal setup surface for channel tools, code access, and sandbox state.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Badge tone={runtimeMode === "opencode" ? "success" : "warning"}>{runtimeMode}</Badge>
          {configVersion && <Badge>v{configVersion}</Badge>}
        </div>
      </div>

      {message && (
        <Card style={{ marginBottom: 16 }}>
          <CardContent>
            <p style={{ margin: 0 }}>{message}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <Card className="ui-card-cult">
          <CardHeader>
            <CardTitle>Channel identity</CardTitle>
            <CardDescription>Slack channel boundary for this Space.</CardDescription>
          </CardHeader>
          <CardContent style={{ display: "grid", gap: 12 }}>
            <FieldValue label="Name" value={space.name} />
            <FieldValue label="Slug" value={space.slug} />
            <FieldValue label="Slack channel" value={space.externalSpaceId} />
            <FieldValue label="Space ID" value={space.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Runtime mode</CardTitle>
            <CardDescription>{runtimeCopy[runtimeMode]}</CardDescription>
          </CardHeader>
          <CardContent>
            <Label>
              Mode
              <Select
                value={runtimeMode}
                onChange={(e) => setRuntimeMode(e.target.value as "opencode" | "orchestrator")}
              >
                <option value="opencode">opencode</option>
                <option value="orchestrator">orchestrator</option>
              </Select>
            </Label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Governance</CardTitle>
            <CardDescription>Fast links for operational controls.</CardDescription>
          </CardHeader>
          <CardContent style={{ display: "grid", gap: 10 }}>
            <Link className="ui-button" href={`/admin/spaces/${spaceId}/memory`}>Memory</Link>
            <Link className="ui-button" href={`/admin/spaces/${spaceId}/usage`}>Usage</Link>
            <Link className="ui-button" href={`/admin/spaces/${spaceId}/schedules`}>Schedules</Link>
            <Link className="ui-button" href="/admin/audit">Audit log</Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Card>
          <CardHeader>
            <CardTitle>Agent config</CardTitle>
            <CardDescription>Saved changes create a new active Space config version.</CardDescription>
          </CardHeader>
          <CardContent style={{ display: "grid", gap: 14 }}>
            <Label>
              Model
              <Input value={modelId} onChange={(e) => setModelId(e.target.value)} />
            </Label>
            <div className="grid-2">
              <Label>
                Reasoning
                <Select value={reasoning} onChange={(e) => setReasoning(e.target.value)}>
                  <option value="provider-default">provider default</option>
                  <option value="none">none</option>
                  <option value="minimal">minimal</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="xhigh">xhigh</option>
                </Select>
              </Label>
              <Label>
                Max steps
                <Input
                  type="number"
                  min={1}
                  max={40}
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(Number(e.target.value))}
                />
              </Label>
            </div>
            <Label>
              Instructions
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={10}
              />
            </Label>
          </CardContent>
          <CardFooter>
            <Button variant="primary" onClick={save} disabled={busyAction !== null}>
              Save new config version
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Codebase access</CardTitle>
            <CardDescription>Repo used by opencode and approved coding runs.</CardDescription>
          </CardHeader>
          <CardContent style={{ display: "grid", gap: 14 }}>
            <Label>
              Repo URL
              <Input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
              />
            </Label>
            <div className="grid-2">
              <FieldValue
                label="Parsed GitHub repo"
                value={
                  codebase?.parsedGitHubRepo
                    ? `${codebase.parsedGitHubRepo.owner}/${codebase.parsedGitHubRepo.repo}`
                    : null
                }
              />
              <div>
                <span className="muted" style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
                  Private repo token
                </span>
                <Badge tone={codebase?.hasGlobalGitHubToken ? "success" : "warning"}>
                  {codebase?.hasGlobalGitHubToken ? "configured" : "not configured"}
                </Badge>
              </div>
            </div>
            {codebase?.result && (
              <Card>
                <CardContent>
                  <Badge tone={statusTone(codebase.result.status)}>{codebase.result.status}</Badge>
                  <p className="muted" style={{ margin: "10px 0 0" }}>{codebase.result.message}</p>
                  {codebase.result.defaultBranch && (
                    <p className="muted" style={{ margin: "6px 0 0" }}>
                      Default branch: <code>{codebase.result.defaultBranch}</code>
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
          <CardFooter style={{ display: "flex", gap: 8 }}>
            <Button onClick={testRepoAccess} disabled={busyAction !== null}>
              Test repo access
            </Button>
            <Button variant="primary" onClick={save} disabled={busyAction !== null}>
              Save repo
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Card>
          <CardHeader>
            <CardTitle>Native tools</CardTitle>
            <CardDescription>Built-in Tags capabilities available to this Space.</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Composio connections</CardTitle>
            <CardDescription>
              Entity ID is the Space ID. Toolkits only load in orchestrator mode today.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ marginBottom: 12 }}>
              <Badge tone={connections?.hasComposioApiKey ? "success" : "danger"}>
                {connections?.hasComposioApiKey ? "COMPOSIO_API_KEY configured" : "missing API key"}
              </Badge>
            </div>
            {(connections?.toolkits ?? COMPOSIO_TOOLKITS).map((toolkit) => (
              <div
                key={toolkit.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 0",
                  borderTop: "1px solid rgb(255 255 255 / 0.06)",
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <strong style={{ fontSize: 14 }}>{toolkit.label}</strong>
                    {"status" in toolkit && (
                      <Badge tone={statusTone(String(toolkit.status))}>{String(toolkit.status)}</Badge>
                    )}
                  </div>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.4 }}>
                    {toolkit.description}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Switch
                    checked={enabledConnections.includes(toolkit.id)}
                    onCheckedChange={(checked) =>
                      setEnabledConnections((prev) => toggle(prev, toolkit.id, checked))
                    }
                  />
                  <Button
                    onClick={() => connectToolkit(toolkit.id)}
                    disabled={busyAction !== null || !connections?.hasComposioApiKey}
                  >
                    Connect
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
          <CardFooter>
            <Button variant="primary" onClick={save} disabled={busyAction !== null}>
              Save tool access
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="grid-2">
        <Card>
          <CardHeader>
            <CardTitle>Persistent sandbox</CardTitle>
            <CardDescription>Live E2B/opencode workspace for this channel.</CardDescription>
          </CardHeader>
          <CardContent style={{ display: "grid", gap: 12 }}>
            <Badge tone={sandbox?.hasE2bApiKey ? "success" : "danger"}>
              {sandbox?.hasE2bApiKey ? "E2B configured" : "E2B missing"}
            </Badge>
            {sandbox?.sandbox ? (
              <>
                <Badge tone={statusTone(sandbox.sandbox.status)}>{sandbox.sandbox.status}</Badge>
                <FieldValue label="Session ID" value={sandbox.sandbox.id} />
                <FieldValue label="E2B sandbox" value={sandbox.sandbox.externalSandboxId} />
                <FieldValue label="Active run" value={sandbox.sandbox.activeRunId} />
                <FieldValue label="Lease expires" value={sandbox.sandbox.leaseExpiresAt} />
                <FieldValue label="Last used" value={sandbox.sandbox.lastUsedAt} />
                <FieldValue label="Workdir" value={sandbox.sandbox.workdir} />
              </>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No sandbox session exists yet. The first coding run will create one.
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button
              variant="danger"
              onClick={resetSandbox}
              disabled={busyAction !== null || !sandbox?.sandbox}
            >
              Reset sandbox
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test prompts</CardTitle>
            <CardDescription>Copy these into Slack to verify capabilities.</CardDescription>
          </CardHeader>
          <CardContent style={{ display: "grid", gap: 10 }}>
            {[
              "@tags what tools and connections do you have access to?",
              "@tags remember that this channel uses Tags as its channel agent.",
              "@tags inspect the repo and explain the Slack mention to agent response flow. Do not edit files.",
              "@tags create a small channel-notes.md file in the workspace and summarize what changed.",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="ui-button"
                style={{ justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left" }}
                onClick={() => navigator.clipboard?.writeText(prompt)}
              >
                {prompt}
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

