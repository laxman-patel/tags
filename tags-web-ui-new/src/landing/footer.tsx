import { LinkButton } from "@cloudflare/kumo";

import { GitHubIcon } from "./github-icon";
import { GetStartedButton } from "./get-started-button";
import { keepLastWordsTogether } from "./typography";

type FooterProps = {
  clerkEnabled?: boolean;
};

export function Footer({ clerkEnabled = false }: FooterProps) {
  return (
    <footer className="flex flex-col items-center gap-10 overflow-x-clip pb-0 pt-24 lg:pt-28">
      <div className="container space-y-3 text-center">
        <h2 className="text-2xl tracking-tight md:text-3xl lg:text-4xl">
          Put an AI teammate in every channel
        </h2>
        <p className="mx-auto max-w-lg leading-snug text-balance text-muted-foreground">
          {keepLastWordsTogether(
            "Open source and self-hostable. Running in your Slack in minutes.",
          )}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <GetStartedButton clerkEnabled={clerkEnabled} size="lg" />
          <LinkButton
            href="https://github.com/laxman-patel/tags"
            external
            variant="secondary"
            size="lg"
            icon={<GitHubIcon />}
          >
            GitHub
          </LinkButton>
        </div>
      </div>

      <div className="landing-footer-watermark mt-10 w-full leading-none select-none md:mt-16">
        <span className="font-display block w-full bg-linear-to-b from-primary from-20% via-primary/60 via-55% to-transparent bg-clip-text text-center text-[24vw] leading-[0.95] font-semibold tracking-[-0.015em] text-transparent lg:text-[15rem]">
          @tags
        </span>
      </div>
    </footer>
  );
}
