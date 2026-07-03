"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";

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
    <main className="mx-auto w-full max-w-[1200px] px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pending human-in-the-loop requests from agent runs.
        </p>
      </div>

      {approvals === null && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      )}

      {approvals !== null && approvals.length === 0 && (
        <EmptyState
          title="Inbox zero"
          description="No pending approvals. Requests appear here when a run needs a human decision."
        />
      )}

      {approvals !== null && approvals.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {approvals.map((a) => (
            <Card key={a.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-sm font-medium">{a.toolName}</span>
                  <Badge variant={riskVariant(a.riskLevel)}>{a.riskLevel}</Badge>
                </div>
                <p className="mt-2 mb-0 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {a.requestText}
                </p>
                {a.status === "pending" && (
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" onClick={() => respond(a.id, "approved")}>
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => respond(a.id, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
