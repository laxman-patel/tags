"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function SpaceUsagePage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!spaceId) return;
    fetch(`/api/usage/${spaceId}`, { headers: { "x-tags-admin-key": getKey() } })
      .then((r) => r.json())
      .then(setUsage);
  }, [spaceId]);

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto", fontFamily: "system-ui" }}>
      <p><Link href={`/admin/spaces/${spaceId}`}>← Space</Link></p>
      <h1>Usage & spend</h1>
      <pre style={{ background: "#f4f4f5", padding: 16, borderRadius: 8 }}>
        {JSON.stringify(usage, null, 2)}
      </pre>
    </main>
  );
}

function getKey(): string {
  const match = document.cookie.match(/tags_admin=([^;]+)/);
  return match?.[1] ?? "";
}
