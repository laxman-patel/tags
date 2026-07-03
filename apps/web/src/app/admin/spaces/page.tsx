"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(data.error ?? `Request failed with ${r.status}`);
        }
        return data;
      })
      .then((data) => {
        if (data.spaces) setSpaces(data.spaces);
        else setError(data.error ?? "Failed to load");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  return (
    <main className="admin-shell">
      <p className="muted"><Link href="/">← Home</Link></p>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: "-0.04em" }}>Spaces</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            Configure each Slack channel as a scoped Tags teammate.
          </p>
        </div>
        <Link className="ui-button ui-button-primary" href="/admin/spaces/new">Create space</Link>
      </div>

      {error && (
        <Card style={{ marginTop: 18 }}>
          <CardHeader>
            <CardTitle>Cannot load Spaces</CardTitle>
            <CardDescription>
              {error === "Unauthorized"
                ? "You are signed out or your Clerk account is not authorized as a Tags admin."
                : error}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="muted" style={{ margin: 0 }}>
              Use the sign-in control in the top-right. If you are already signed in, add your email
              or Clerk user id to the admin allowlist.
            </p>
          </CardContent>
        </Card>
      )}

      <Card style={{ marginTop: 18 }}>
        <CardHeader>
          <CardTitle>Configured Spaces</CardTitle>
          <CardDescription>{spaces.length} channel{spaces.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th align="left" style={{ padding: "10px 8px", color: "var(--muted)" }}>Name</th>
                  <th align="left" style={{ padding: "10px 8px", color: "var(--muted)" }}>Slug</th>
                  <th align="left" style={{ padding: "10px 8px", color: "var(--muted)" }}>Channel</th>
                  <th align="left" style={{ padding: "10px 8px", color: "var(--muted)" }}>Workspace</th>
                </tr>
              </thead>
              <tbody>
                {spaces.map((s) => (
                  <tr key={s.id} style={{ borderTop: "1px solid rgb(255 255 255 / 0.06)" }}>
                    <td style={{ padding: "12px 8px" }}>
                      <Link href={`/admin/spaces/${s.id}`} style={{ fontWeight: 650 }}>
                        {s.name}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <Badge>{s.slug}</Badge>
                    </td>
                    <td style={{ padding: "12px 8px" }}><code>{s.externalSpaceId}</code></td>
                    <td style={{ padding: "12px 8px" }}>{s.workspaceName ?? s.workspaceTeamId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

