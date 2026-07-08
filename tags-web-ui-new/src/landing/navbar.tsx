import { Github } from "lucide-react";

import tagsIcon from "../imports/tags-icon.png";
import { GetStartedButton } from "./get-started-button";
import { Button } from "./ui";

type NavbarProps = {
  clerkEnabled?: boolean;
};

export const Navbar = ({ clerkEnabled = false }: NavbarProps) => {
  return (
    <header className="fixed inset-x-0 top-3 z-50 flex justify-center px-4 lg:top-5">
      <nav className="flex w-full max-w-[620px] items-center justify-between gap-3 rounded-full bg-background/75 py-2 pl-4 pr-2 shadow-[var(--shadow-nav)] ring-1 ring-black/[0.05] backdrop-blur-xl">
        <a
          href="/home"
          className="flex shrink-0 items-center gap-2 rounded-full pr-2 transition-opacity hover:opacity-80"
        >
          <img
            src={tagsIcon}
            alt=""
            width={26}
            height={26}
            className="size-[26px] rounded-lg object-contain"
          />
          <span className="font-display text-[17px] font-semibold tracking-tight">
            @tags
          </span>
        </a>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="https://github.com/laxman-patel/tags">
              <Github className="size-4" />
              <span className="max-sm:sr-only">GitHub</span>
            </a>
          </Button>
          <GetStartedButton clerkEnabled={clerkEnabled} size="sm" />
        </div>
      </nav>
    </header>
  );
};
