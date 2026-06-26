"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function SpaceMemoryPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [memories, setMemories] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!spaceId) return;
    fetch(`/api/memory/${spaceId}`, { headers: { "x-tags-admin-key": getKey() } })
      .then((r) => r.json())
      .then((d) => setMemories(d.memories ?? []));
  }, [spaceId]);

  async function forget(id: string) {
    await fetch(`/api/memory/item/${id}`, {
      method: "DELETE",
      headers: { "x-tags-admin-key": getKey() },
    });
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto", fontFamily: "system-ui" }}>
      <p><Link href={`/admin/spaces/${spaceId}`}>← Space</Link></p>
      <h1>Space memory</h1>
      <ul>
        {memories.map((m) => (
          <li key={String(m.id)} style={{ marginBottom: 12 }}>
            <strong>[{String(m.kind)}]</strong> {String(m.content)}
            <button type="button" onClick={() => forget(String(m.id))} style={{ marginLeft: 8 }}>Forget</button>
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
