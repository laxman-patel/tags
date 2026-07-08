import { Github } from "lucide-react";

import { GetStartedButton } from "./get-started-button";
import { Button } from "./ui";

type FooterProps = {
  clerkEnabled?: boolean;
};

export function Footer({ clerkEnabled = false }: FooterProps) {
  return (
    <footer className="flex flex-col items-center gap-14 overflow-hidden pt-28 lg:pt-32">
      <div className="container space-y-3 text-center">
        <h2 className="text-2xl tracking-tight md:text-4xl lg:text-5xl">
          Put an AI teammate in every channel
        </h2>
        <p className="mx-auto max-w-xl leading-snug text-balance text-muted-foreground">
          Open source and self-hostable. Running in your Slack in minutes.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          <GetStartedButton clerkEnabled={clerkEnabled} size="lg" />
          <Button size="lg" variant="outline" asChild>
            <a href="https://github.com/laxman-patel/tags">
              <Github className="size-4" />
              GitHub
            </a>
          </Button>
        </div>
      </div>

      <div className="-mb-[6vw] mt-10 w-full overflow-hidden leading-none select-none md:mt-14 lg:mt-20">
        <span className="font-display block w-full bg-linear-to-b from-primary to-primary/10 bg-clip-text text-center text-[38vw] leading-[0.75] font-semibold tracking-tight text-transparent lg:text-[24rem]">
          tags
        </span>
      </div>
    </footer>
  );
}
