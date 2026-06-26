"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function AuditPage() {
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetch("/api/audit", { headers: { "x-tags-admin-key": getKey() } })
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []));
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui" }}>
      <p><Link href="/admin/spaces">← Admin</Link> · <Link href="/api/export">Export JSON</Link></p>
      <h1>Audit log</h1>
      <ul>
        {events.map((e) => (
          <li key={String(e.id)} style={{ marginBottom: 8 }}>
            <code>{String(e.eventType)}</code> — {new Date(String(e.createdAt)).toLocaleString()}
            <pre style={{ fontSize: 12 }}>{JSON.stringify(e.payload)}</pre>
          </li>
        ))}
      </ul>
    </main>
  );
}

function getKey(): string {
  const match = document.cookie.match(/tags_admin=([^;]+)/);
  return match?.[1] ?? "";
}
