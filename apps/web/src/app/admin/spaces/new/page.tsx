"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MinimalCard } from "@/components/ui/minimal-card";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";

export default function NewSpacePage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: form.get("name"),
          slug: form.get("slug"),
          externalSpaceId: form.get("channelId"),
          modelId: form.get("modelId"),
          instructions: form.get("instructions"),
          enabledTools: [
            "search_thread",
            "search_memory",
            "save_memory",
            "create_artifact",
          ],
          runtimeMode: "opencode",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/admin/spaces/${data.spaceId}`);
      } else {
        setError(data.error ?? "Failed to create space");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[640px] px-4 py-10">
      <PageHeader
        title="Create Space"
        description="Connect a Slack channel to a new scoped agent."
        backHref="/admin/spaces"
        backLabel="Spaces"
      />

      <MinimalCard className="p-5">
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="Growth team" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" required placeholder="growth" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="channelId">Slack channel ID</Label>
              <Input id="channelId" name="channelId" required placeholder="C0123456789" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="modelId">Model ID</Label>
            <Input id="modelId" name="modelId" required defaultValue="openai/gpt-4o-mini" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              name="instructions"
              rows={6}
              required
              placeholder="You are the channel agent for..."
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create space"}
            </Button>
          </div>
        </form>
      </MinimalCard>
    </main>
  );
}
