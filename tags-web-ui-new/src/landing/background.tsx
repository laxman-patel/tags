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
        "landing-background relative",
        variant === "top" &&
          "landing-background-top rounded-t-2xl rounded-b-xl bg-linear-to-b from-primary/30 via-background via-20% to-background/80",
        variant === "bottom" &&
          "landing-background-bottom mb-0 rounded-t-xl rounded-b-none bg-linear-to-b from-background via-background to-primary/50",
        className,
      )}
    >
      {children}
    </div>
  );
};
