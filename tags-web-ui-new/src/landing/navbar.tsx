import { LinkButton } from "@cloudflare/kumo";
import { GithubLogoIcon } from "@phosphor-icons/react";

import tagsIcon from "../imports/tags-icon.png";
import { GetStartedButton } from "./get-started-button";

type NavbarProps = {
  clerkEnabled?: boolean;
};

export const Navbar = ({ clerkEnabled = false }: NavbarProps) => {
  return (
    <header className="fixed inset-x-0 top-3 z-50 flex justify-center px-4 lg:top-5">
      <nav className="flex w-full max-w-[620px] items-center justify-between gap-3 rounded-md bg-background/75 py-2 pl-4 pr-2 shadow-[var(--shadow-nav)] ring-1 ring-black/[0.05] backdrop-blur-xl">
        <a
          href="/home"
          className="flex shrink-0 items-center gap-2.5 rounded-full pr-2 transition-opacity hover:opacity-80"
        >
          <img
            src={tagsIcon}
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-[22%] object-cover shadow-[0_1px_2px_rgba(42,111,215,0.35)]"
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
            icon={GithubLogoIcon}
          >
            <span className="max-sm:sr-only">GitHub</span>
          </LinkButton>
          <GetStartedButton clerkEnabled={clerkEnabled} size="sm" />
        </div>
      </nav>
    </header>
  );
};
