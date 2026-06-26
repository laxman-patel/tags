"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SpaceRow = {
  id: string;
  name: string;
  slug: string;
  externalSpaceId: string;
  workspaceName: string | null;
  workspaceTeamId: string;
};

export default function AdminSpacesPage() {
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/spaces")
      .then((r) => r.json())
      .then((data) => {
        if (data.spaces) setSpaces(data.spaces);
        else setError(data.error ?? "Failed to load");
      })
      .catch(() => setError("Failed to load"));
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto", fontFamily: "system-ui" }}>
      <p><Link href="/">← Home</Link></p>
      <h1>Spaces</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <p><Link href="/admin/spaces/new">Create space</Link></p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Name</th>
            <th align="left">Slug</th>
            <th align="left">Channel</th>
            <th align="left">Workspace</th>
          </tr>
        </thead>
        <tbody>
          {spaces.map((s) => (
            <tr key={s.id} style={{ borderTop: "1px solid #eee" }}>
              <td><Link href={`/admin/spaces/${s.id}`}>{s.name}</Link></td>
              <td>{s.slug}</td>
              <td><code>{s.externalSpaceId}</code></td>
              <td>{s.workspaceName ?? s.workspaceTeamId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

