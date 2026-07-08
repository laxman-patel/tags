import type { ReactNode } from "react";

import { cn } from "./cn";

type BackgroundProps = {
  children: ReactNode;
  variant?: "top" | "bottom";
  className?: string;
};

export const Background = ({
  children,
  variant = "top",
  className,
}: BackgroundProps) => {
  return (
    <div
      className={cn(
        "relative mx-2.5 mt-2.5 lg:mx-4",
        variant === "top" &&
          "rounded-t-4xl rounded-b-2xl bg-linear-to-b from-primary/30 via-background via-20% to-background/80",
        variant === "bottom" &&
          "rounded-t-2xl rounded-b-4xl bg-linear-to-b from-background via-background to-primary/50",
        className,
      )}
    >
      {children}
    </div>
  );
};
