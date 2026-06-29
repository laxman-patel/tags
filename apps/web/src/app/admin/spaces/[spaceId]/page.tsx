"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function SpaceDetailPage() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;
  const [space, setSpace] = useState<Record<string, unknown> | null>(null);
  const [modelId, setModelId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [enabledTools, setEnabledTools] = useState("");
  const [runtimeMode, setRuntimeMode] = useState<"opencode" | "orchestrator">("opencode");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!spaceId) return;
    fetch(`/api/spaces/${spaceId}`)
      .then((r) => r.json())
      .then((data) => {
        setSpace(data.space);
        setModelId(String(data.activeConfig?.modelId ?? ""));
        setInstructions(String(data.activeConfig?.instructions ?? ""));
        setEnabledTools((data.activeConfig?.enabledTools as string[])?.join(", ") ?? "");
        const mode = data.activeConfig?.runtimeMode;
        setRuntimeMode(mode === "orchestrator" ? "orchestrator" : "opencode");
      });
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
        enabledTools: enabledTools.split(",").map((s) => s.trim()).filter(Boolean),
        runtimeMode,
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Saved v${data.version}` : "Error");
  }

  if (!space) return <main style={{ padding: 24 }}>Loading…</main>;

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto", fontFamily: "system-ui" }}>
      <p><Link href="/admin/spaces">← Spaces</Link></p>
      <h1>{String(space.name)}</h1>
      <p>Channel: <code>{String(space.externalSpaceId)}</code></p>
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>Model<input value={modelId} onChange={(e) => setModelId(e.target.value)} style={{ width: "100%" }} /></label>
        <label>Instructions<textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={8} style={{ width: "100%" }} /></label>
        <label>
          Runtime mode
          <select
            value={runtimeMode}
            onChange={(e) => setRuntimeMode(e.target.value as "opencode" | "orchestrator")}
            style={{ width: "100%" }}
          >
            <option value="opencode">opencode (E2B harness — default)</option>
            <option value="orchestrator">orchestrator (AI SDK + Composio tools)</option>
          </select>
        </label>
        <label>Tools (comma-separated)<input value={enabledTools} onChange={(e) => setEnabledTools(e.target.value)} style={{ width: "100%" }} /></label>
        <button type="button" onClick={save}>Save new config version</button>
      </div>
      {message && <p>{message}</p>}
      <p style={{ marginTop: 24 }}>
        <Link href={`/admin/spaces/${spaceId}/memory`}>Memory</Link> ·
        <Link href={`/admin/spaces/${spaceId}/usage`}>Usage</Link> ·
        <Link href={`/admin/spaces/${spaceId}/schedules`}>Schedules</Link>
      </p>
    </main>
  );
}

