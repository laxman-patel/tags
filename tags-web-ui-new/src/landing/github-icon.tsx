import { cn } from "./cn";

import githubMark from "../imports/Octicons-mark-github.svg";

type GitHubIconProps = {
  className?: string;
};

export function GitHubIcon({ className }: GitHubIconProps) {
  return (
    <img
      src={githubMark}
      alt=""
      aria-hidden
      className={cn("size-4 shrink-0", className)}
    />
  );
}
