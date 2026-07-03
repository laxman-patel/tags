"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MinimalCard,
  MinimalCardDescription,
  MinimalCardTitle,
} from "@/components/ui/minimal-card";
import { PageHeader } from "@/components/page-header";

type ApprovalRow = {
  id: string;
  toolName: string;
  requestText: string;
  riskLevel: string;
  status: string;
};

function riskVariant(risk: string) {
  if (risk === "high") return "destructive" as const;
  if (risk === "medium") return "outline" as const;
  return "secondary" as const;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRow[] | null>(null);

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
    setApprovals((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
  }

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-10">
      <PageHeader
        title="Approval inbox"
        description="Pending human-in-the-loop requests from agent runs."
        backHref="/admin/spaces"
        backLabel="Admin"
      />

      {approvals === null && (
        <div className="grid gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-[24px] bg-neutral-900" />
          ))}
        </div>
      )}

      {approvals !== null && approvals.length === 0 && (
        <MinimalCard className="p-8 text-center">
          <MinimalCardTitle className="mt-0 text-base">Inbox zero</MinimalCardTitle>
          <MinimalCardDescription className="mt-1 pb-0">
            No pending approvals. Requests appear here when a run needs a human decision.
          </MinimalCardDescription>
        </MinimalCard>
      )}

      <div className="grid gap-3">
        {approvals?.map((a) => (
          <MinimalCard key={a.id} className="p-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium">{a.toolName}</span>
              <Badge variant={riskVariant(a.riskLevel)}>{a.riskLevel} risk</Badge>
            </div>
            <p className="mt-2 mb-0 text-sm leading-relaxed text-muted-foreground">
              {a.requestText}
            </p>
            {a.status === "pending" && (
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => respond(a.id, "approved")}>
                  Approve
                </Button>
                <Button variant="destructive" size="sm" onClick={() => respond(a.id, "rejected")}>
                  Reject
                </Button>
              </div>
            )}
          </MinimalCard>
        ))}
      </div>
    </main>
  );
}
