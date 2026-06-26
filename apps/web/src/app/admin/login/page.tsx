"use client";

import { useState } from "react";
import Link from "next/link";

export default function AdminLoginPage() {
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");

  async function login() {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    setMessage(res.ok ? "Logged in" : "Invalid key");
    if (res.ok) window.location.href = "/admin/spaces";
  }

  return (
    <main style={{ padding: 48, maxWidth: 400, margin: "0 auto", fontFamily: "system-ui" }}>
      <h1>Admin login</h1>
      <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Admin key" style={{ width: "100%", marginBottom: 12 }} />
      <button type="button" onClick={login}>Login</button>
      <p>{message}</p>
      <p><Link href="/">Home</Link></p>
    </main>
  );
}
