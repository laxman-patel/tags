import { LinkButton } from "@cloudflare/kumo";

import { GitHubIcon } from "./github-icon";
import tagsNavIcon from "../imports/tags-nav-icon-final.png";
import { GetStartedButton } from "./get-started-button";

type NavbarProps = {
  clerkEnabled?: boolean;
};

/** Intrinsic logo size: 354×145 (~2.44:1). */
const NAV_LOGO_HEIGHT = 24;
const NAV_LOGO_WIDTH = Math.round(NAV_LOGO_HEIGHT * (354 / 145));

export const Navbar = ({ clerkEnabled = false }: NavbarProps) => {
  return (
    <header className="fixed inset-x-0 top-3 z-50 flex justify-center px-4 lg:top-5">
      <nav className="flex w-full max-w-[620px] items-center justify-between gap-3 rounded-xl bg-white/50 py-2 pl-3.5 pr-2 ring-1 ring-black/[0.05] backdrop-blur-xl">
        <a
          href="/home"
          className="flex shrink-0 items-center rounded-md transition-opacity hover:opacity-80"
        >
          <img
            src={tagsNavIcon}
            alt="@tags"
            width={NAV_LOGO_WIDTH}
            height={NAV_LOGO_HEIGHT}
            className="landing-navbar-icon shrink-0"
            draggable={false}
          />
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
