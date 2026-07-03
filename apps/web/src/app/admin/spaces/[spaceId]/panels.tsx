import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { badgeVariantForTone, type StatusTone } from "@/lib/status-badge";

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <Badge variant={badgeVariantForTone(tone)}>{children}</Badge>;
}

export function FieldValue({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="break-all font-mono text-[13px]">{value || "not set"}</span>
    </div>
  );
}
