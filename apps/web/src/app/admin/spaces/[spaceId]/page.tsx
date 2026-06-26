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
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!spaceId) return;
    fetch(`/api/spaces/${spaceId}`, { headers: { "x-tags-admin-key": getKey() } })
      .then((r) => r.json())
      .then((data) => {
        setSpace(data.space);
        setModelId(String(data.activeConfig?.modelId ?? ""));
        setInstructions(String(data.activeConfig?.instructions ?? ""));
        setEnabledTools((data.activeConfig?.enabledTools as string[])?.join(", ") ?? "");
      });
  }, [spaceId]);

  async function save() {
    const res = await fetch(`/api/spaces/${spaceId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tags-admin-key": getKey(),
      },
      body: JSON.stringify({
        modelId,
        instructions,
        enabledTools: enabledTools.split(",").map((s) => s.trim()).filter(Boolean),
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

function getKey(): string {
  const match = document.cookie.match(/tags_admin=([^;]+)/);
  return match?.[1] ?? "";
}
