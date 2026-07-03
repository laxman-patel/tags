"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Hash, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SpaceRow = {
  id: string;
  name: string;
  slug: string;
  externalSpaceId: string;
  workspaceName: string | null;
  workspaceTeamId: string;
};

export default function SpacesDashboard() {
  const [spaces, setSpaces] = useState<SpaceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/spaces")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? `Request failed with ${r.status}`);
        return data;
      })
      .then((data) => setSpaces(data.spaces ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  return (
    <main className="mx-auto w-full max-w-[1200px] px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Spaces</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each Space is one Slack channel with its own scoped agent.
          </p>
        </div>
        <Link className={buttonVariants({ size: "sm" })} href="/admin/spaces/new">
          <Plus data-icon="inline-start" />
          New space
        </Link>
      </div>

      {error && (
        <Card>
          <CardHeader>
            <CardTitle>Cannot load Spaces</CardTitle>
            <CardDescription>
              {error === "Unauthorized"
                ? "Sign in from the top-right corner. If you are already signed in, your account is not on the Tags admin allowlist."
                : error}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!error && spaces === null && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      )}

      {!error && spaces !== null && spaces.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">No spaces yet</p>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              Create your first Space to connect a Slack channel.
            </p>
            <Link className={buttonVariants({ size: "sm" })} href="/admin/spaces/new">
              Create space
            </Link>
          </CardContent>
        </Card>
      )}

      {!error && spaces !== null && spaces.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((s) => (
            <Link key={s.id} href={`/admin/spaces/${s.id}`}>
              <Card className="h-full transition-colors hover:ring-foreground/25">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    {s.name}
                    <Badge variant="outline">{s.slug}</Badge>
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1.5 font-mono text-xs">
                    <Hash className="size-3" />
                    {s.externalSpaceId}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="m-0 text-xs text-muted-foreground">
                    {s.workspaceName ?? s.workspaceTeamId}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
