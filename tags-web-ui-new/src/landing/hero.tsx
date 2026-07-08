import * as Dialog from "@radix-ui/react-dialog";
import { LinkButton } from "@cloudflare/kumo";
import {
  LayoutGrid,
  MessagesSquare,
  Play,
  Radio,
  ShieldCheck,
  X,
} from "lucide-react";
import { GithubLogoIcon } from "@phosphor-icons/react";

import { DashedLine } from "./dashed-line";
import { GetStartedButton } from "./get-started-button";

// Replace with the real Slack screenshot + demo video when available.
const DEMO_SCREENSHOT_SRC: string | null = null;
const DEMO_VIDEO_SRC: string | null = null;

const features = [
  {
    title: "Streams as it works",
    description: "Live progress in the thread, not a spinner.",
    icon: Radio,
  },
  {
    title: "Asks before acting",
    description: "Risky actions pause for a human Approve or Reject.",
    icon: ShieldCheck,
  },
  {
    title: "Replies with UI",
    description: "Interactive cards in Slack, not walls of text.",
    icon: LayoutGrid,
  },
  {
    title: "Knows the thread",
    description: "Full conversation context on every run.",
    icon: MessagesSquare,
  },
];

type HeroProps = {
  clerkEnabled?: boolean;
};

export const Hero = ({ clerkEnabled = false }: HeroProps) => {
  return (
    <section className="pb-16 pt-28 lg:pb-24 lg:pt-36">
      <div className="container">
        <div className="flex flex-col justify-between gap-8 md:gap-12 lg:flex-row lg:gap-16">
          <div className="flex-1">
            <h1 className="max-w-[13ch] text-[2rem] font-semibold leading-[1.08] tracking-tight text-foreground md:text-[2.5rem] lg:text-[2.75rem]">
              The open-source AI teammate for Slack
            </h1>

            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
              Mention @tags in any channel. It reads the whole thread, does the
              work, and asks before doing anything it shouldn&apos;t.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <GetStartedButton clerkEnabled={clerkEnabled} />
              <LinkButton
                href="https://github.com/laxman-patel/tags"
                external
                variant="secondary"
                icon={GithubLogoIcon}
              >
                GitHub
              </LinkButton>
            </div>
          </div>

          <div className="relative flex flex-1 flex-col justify-center gap-4 max-lg:pt-8 lg:pl-12">
            <DashedLine
              orientation="vertical"
              className="absolute top-0 left-0 max-lg:hidden"
            />
            <DashedLine
              orientation="horizontal"
              className="absolute top-0 lg:hidden"
            />
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="flex gap-3">
                  <Icon className="mt-0.5 size-[18px] shrink-0 text-primary" />
                  <div>
                    <h2 className="font-text text-sm font-semibold text-foreground">
                      {feature.title}
                    </h2>
                    <p className="mt-0.5 max-w-72 text-sm leading-snug text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 md:mt-16 lg:mt-20">
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="group relative aspect-[16/9] w-full cursor-pointer overflow-hidden rounded-2xl bg-muted text-left shadow-[var(--shadow-card)] ring-1 ring-black/[0.05] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(16,24,40,0.06),0_28px_60px_-24px_rgba(16,24,40,0.4)]"
            >
              {DEMO_SCREENSHOT_SRC ? (
                <img
                  src={DEMO_SCREENSHOT_SRC}
                  alt="Tags Slack demo"
                  className="h-full w-full object-cover object-left-top"
                />
              ) : (
                <div className="grid h-full w-full place-items-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-105">
                      <Play className="size-7 fill-current" />
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Watch Tags work a Slack thread
                    </span>
                  </div>
                </div>
              )}
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
            <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <Dialog.Title className="sr-only">Tags demo video</Dialog.Title>
              <div className="relative aspect-video w-full max-w-4xl overflow-hidden rounded-xl bg-black">
                {DEMO_VIDEO_SRC ? (
                  <video
                    src={DEMO_VIDEO_SRC}
                    controls
                    autoPlay
                    className="h-full w-full"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-sm text-white/70">
                    Demo video coming soon
                  </div>
                )}
                <Dialog.Close className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20">
                  <X className="size-4" />
                  <span className="sr-only">Close demo video</span>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        </div>
      </div>
    </section>
  );
};
