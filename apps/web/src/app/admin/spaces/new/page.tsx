"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
    <main className="mx-auto w-full max-w-[640px] px-6 py-8">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Spaces
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Create Space</CardTitle>
          <CardDescription>Connect a Slack channel to a new scoped agent.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </main>
  );
}
