"use client";

import Link from "next/link";
import { useState } from "react";

export default function NewSpacePage() {
  const [status, setStatus] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
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
          "run_coding_agent",
        ],
      }),
    });
    const data = await res.json();
    setStatus(res.ok ? `Created space ${data.spaceId}` : data.error ?? "Error");
  }

  return (
    <main style={{ padding: 24, maxWidth: 640, margin: "0 auto", fontFamily: "system-ui" }}>
      <p><Link href="/admin/spaces">← Spaces</Link></p>
      <h1>Create Space</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>Name<input name="name" required style={{ width: "100%" }} /></label>
        <label>Slug<input name="slug" required style={{ width: "100%" }} /></label>
        <label>Slack channel ID<input name="channelId" required placeholder="C..." style={{ width: "100%" }} /></label>
        <label>Model ID<input name="modelId" required value="openai/gpt-4o-mini" style={{ width: "100%" }} /></label>
        <label>Instructions<textarea name="instructions" rows={6} required style={{ width: "100%" }} /></label>
        <button type="submit">Create</button>
      </form>
      {status && <p>{status}</p>}
    </main>
  );
}

