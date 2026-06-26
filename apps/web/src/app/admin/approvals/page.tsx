"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApprovalCard } from "@tags/ui";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    fetch("/api/approvals")
      .then((r) => r.json())
      .then((d) => setApprovals(d.approvals ?? []));
  }, []);

  async function respond(id: string, decision: "approved" | "rejected") {
    await fetch(`/api/approvals/${id}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setApprovals((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto", fontFamily: "system-ui" }}>
      <p><Link href="/admin/spaces">← Admin</Link></p>
      <h1>Approval inbox</h1>
      {approvals.map((a) => (
        <div key={String(a.id)} style={{ marginBottom: 16 }}>
          <ApprovalCard
            toolName={String(a.toolName)}
            requestText={String(a.requestText)}
            riskLevel={String(a.riskLevel)}
            status={String(a.status)}
            onApprove={() => respond(String(a.id), "approved")}
            onReject={() => respond(String(a.id), "rejected")}
          />
        </div>
      ))}
    </main>
  );
}

