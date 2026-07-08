import { Github } from "lucide-react";

import tagsIcon from "../imports/tags-icon.png";
import { GetStartedButton } from "./get-started-button";
import { Button } from "./ui";

type NavbarProps = {
  clerkEnabled?: boolean;
};

export const Navbar = ({ clerkEnabled = false }: NavbarProps) => {
  return (
    <section className="absolute left-1/2 top-5 z-50 w-[min(90%,700px)] -translate-x-1/2 rounded-4xl border bg-background/70 backdrop-blur-md transition-all duration-300 lg:top-12">
      <div className="flex items-center justify-between px-6 py-3">
        <a href="/home" className="flex shrink-0 items-center gap-2">
          <img
            src={tagsIcon}
            alt=""
            width={24}
            height={24}
            className="size-6 rounded-md object-contain"
          />
          <span className="font-display text-lg font-semibold tracking-tight">
            Tags
          </span>
        </a>

        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="sm" className="hidden sm:inline-flex" asChild>
            <a href="https://github.com/laxman-patel/tags">
              <Github className="size-4" />
              GitHub
            </a>
          </Button>
          <a
            href="https://github.com/laxman-patel/tags"
            className="text-muted-foreground transition-colors hover:text-foreground sm:hidden"
          >
            <Github className="size-4" />
            <span className="sr-only">GitHub</span>
          </a>
          <GetStartedButton clerkEnabled={clerkEnabled} />
        </div>
      </div>
    </section>
  );
};
