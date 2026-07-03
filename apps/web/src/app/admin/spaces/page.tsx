"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { MinimalCard, MinimalCardDescription, MinimalCardTitle } from "@/components/ui/minimal-card";
import { PageHeader } from "@/components/page-header";

type SpaceRow = {
  id: string;
  name: string;
  slug: string;
  externalSpaceId: string;
  workspaceName: string | null;
  workspaceTeamId: string;
};

export default function AdminSpacesPage() {
  const [spaces, setSpaces] = useState<SpaceRow[] | null>(null);
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
    <main className="mx-auto w-full max-w-[1100px] px-4 py-10">
      <PageHeader
        title="Spaces"
        description="Each Space maps one Slack channel to a scoped Tags teammate."
        actions={
          <Link className={buttonVariants({ size: "sm" })} href="/admin/spaces/new">
            New space
          </Link>
        }
      />

      {error && (
        <MinimalCard className="p-4">
          <MinimalCardTitle className="mt-0 text-base">Cannot load Spaces</MinimalCardTitle>
          <MinimalCardDescription className="mt-1 pb-0">
            {error === "Unauthorized"
              ? "You are signed out or your Clerk account is not on the Tags admin allowlist. Sign in from the top-right corner."
              : error}
          </MinimalCardDescription>
        </MinimalCard>
      )}

      {!error && spaces === null && (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[24px] bg-neutral-900" />
          ))}
        </div>
      )}

      {!error && spaces !== null && spaces.length === 0 && (
        <MinimalCard className="p-8 text-center">
          <MinimalCardTitle className="mt-0 text-base">No spaces yet</MinimalCardTitle>
          <MinimalCardDescription className="mt-1 pb-4">
            Create your first Space to connect a Slack channel.
          </MinimalCardDescription>
          <Link className={buttonVariants({ size: "sm" })} href="/admin/spaces/new">
            Create space
          </Link>
        </MinimalCard>
      )}

      {!error && spaces !== null && spaces.length > 0 && (
        <MinimalCard className="p-2">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Slug</th>
                <th className="px-3 py-2.5 font-medium">Channel</th>
                <th className="px-3 py-2.5 font-medium">Workspace</th>
              </tr>
            </thead>
            <tbody>
              {spaces.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-border/60 transition-colors hover:bg-neutral-800/40"
                >
                  <td className="px-3 py-3">
                    <Link href={`/admin/spaces/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline">{s.slug}</Badge>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                    {s.externalSpaceId}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {s.workspaceName ?? s.workspaceTeamId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </MinimalCard>
      )}
    </main>
  );
}
