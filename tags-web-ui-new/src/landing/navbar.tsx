import { LinkButton } from "@cloudflare/kumo";

import { GitHubIcon } from "./github-icon";
import tagsIcon from "../imports/tags-icon-transparent.svg";
import { GetStartedButton } from "./get-started-button";

type NavbarProps = {
  clerkEnabled?: boolean;
};

export const Navbar = ({ clerkEnabled = false }: NavbarProps) => {
  return (
    <header className="fixed inset-x-0 top-3 z-50 flex justify-center px-4 lg:top-5">
      <nav className="flex w-full max-w-[620px] items-center justify-between gap-3 rounded-xl bg-white/50 py-2 pl-4 pr-2 ring-1 ring-black/[0.05] backdrop-blur-xl">
        <a
          href="/home"
          className="flex shrink-0 items-center gap-2 rounded-full pr-1 transition-opacity hover:opacity-80"
        >
          <img
            src={tagsIcon}
            alt=""
            width={18}
            height={20}
            className="h-5 w-auto shrink-0"
          />
          <span className="font-display text-[17px] font-semibold tracking-tight">
            tags
          </span>
        </a>

        <div className="flex items-center gap-2">
          <LinkButton
            href="https://github.com/laxman-patel/tags"
            external
            variant="secondary"
            size="sm"
            icon={<GitHubIcon className="size-3.5" />}
          >
            <span className="max-sm:sr-only">GitHub</span>
          </LinkButton>
          <GetStartedButton clerkEnabled={clerkEnabled} size="sm" />
        </div>
      </nav>
    </header>
  );
};
