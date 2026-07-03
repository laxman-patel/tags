import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger";
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "ui-button",
        variant === "primary" && "ui-button-primary",
        variant === "danger" && "ui-button-danger",
        className,
      )}
      {...props}
    />
  );
}
