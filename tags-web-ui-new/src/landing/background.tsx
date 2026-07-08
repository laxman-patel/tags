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
        "relative mt-2.5 lg:mt-2.5",
        variant === "top" &&
          "mx-2.5 rounded-t-4xl rounded-b-2xl bg-linear-to-b from-primary/30 via-background via-20% to-background/80 lg:mx-4",
        variant === "bottom" &&
          "mx-0 mb-0 rounded-t-2xl rounded-b-none bg-linear-to-b from-background via-background to-primary/50",
        className,
      )}
    >
      {children}
    </div>
  );
};
