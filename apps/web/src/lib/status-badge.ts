import type { VariantProps } from "class-variance-authority";

import { badgeVariants } from "@/components/ui/badge";

export type StatusTone = "default" | "success" | "warning" | "danger";

export function statusTone(status: string): StatusTone {
  if (["ready", "enabled", "reachable", "success"].includes(status)) return "success";
  if (["leased", "available", "missing_api_key"].includes(status)) return "warning";
  if (["failed", "expired", "not_found_or_no_access", "request_failed"].includes(status)) {
    return "danger";
  }
  return "default";
}

export function badgeVariantForTone(
  tone: StatusTone,
): NonNullable<VariantProps<typeof badgeVariants>["variant"]> {
  switch (tone) {
    case "success":
      return "secondary";
    case "warning":
      return "outline";
    case "danger":
      return "destructive";
    case "default":
      return "default";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}
