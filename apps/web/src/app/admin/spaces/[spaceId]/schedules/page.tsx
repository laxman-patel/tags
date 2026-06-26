"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function SpaceSchedulesPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [schedules, setSchedules] = useState<Array<Record<string, unknown>>>([]);
  const [cron, setCron] = useState("0 9 * * *");
  const [prompt, setPrompt] = useState("Daily digest: summarize open threads");

  useEffect(() => {
    if (!spaceId) return;
    fetch(`/api/schedules/${spaceId}`, { headers: { "x-tags-admin-key": getKey() } })
      .then((r) => r.json())
      .then((d) => setSchedules(d.schedules ?? []));
  }, [spaceId]);

  async function create() {
    await fetch(`/api/schedules/${spaceId}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tags-admin-key": getKey() },
      body: JSON.stringify({
        organizationId: "",
        cron,
        timezone: "UTC",
        prompt,
      }),
    });
    window.location.reload();
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto", fontFamily: "system-ui" }}>
      <p><Link href={`/admin/spaces/${spaceId}`}>← Space</Link></p>
      <h1>Schedules</h1>
      <ul>
        {schedules.map((s) => (
          <li key={String(s.id)}><code>{String(s.cron)}</code> — {String(s.prompt)}</li>
        ))}
      </ul>
      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="Cron" />
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
        <button type="button" onClick={create}>Add schedule</button>
      </div>
    </main>
  );
}

function getKey(): string {
  const match = document.cookie.match(/tags_admin=([^;]+)/);
  return match?.[1] ?? "";
}
