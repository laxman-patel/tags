import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "success" | "warning" | "danger";
};

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "ui-badge",
        tone === "success" && "ui-badge-success",
        tone === "warning" && "ui-badge-warning",
        tone === "danger" && "ui-badge-danger",
        className,
      )}
      {...props}
    />
  );
}
