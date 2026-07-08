import * as Dialog from "@radix-ui/react-dialog";
import {
  Github,
  LayoutGrid,
  MessagesSquare,
  Play,
  Radio,
  ShieldCheck,
  X,
} from "lucide-react";

import { DashedLine } from "./dashed-line";
import { GetStartedButton } from "./get-started-button";
import { Button } from "./ui";

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
    <section className="py-28 lg:py-32 lg:pt-44">
      <div className="container flex flex-col justify-between gap-8 md:gap-14 lg:flex-row lg:gap-20">
        <div className="flex-1">
          <h1 className="max-w-160 text-3xl tracking-tight text-foreground md:text-4xl lg:text-5xl xl:whitespace-nowrap">
            The open-source AI teammate for Slack
          </h1>

          <p className="text-1xl mt-5 text-muted-foreground md:text-3xl">
            Mention @tags in any channel. It reads the whole thread, does the
            work, and asks before doing anything it shouldn't.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4 lg:flex-nowrap">
            <GetStartedButton clerkEnabled={clerkEnabled} />
            <Button
              variant="outline"
              className="h-auto gap-2 bg-linear-to-r from-background to-transparent shadow-md"
              asChild
            >
              <a
                href="https://github.com/laxman-patel/tags"
                className="max-w-56 truncate text-start md:max-w-none"
              >
                <Github className="size-4" />
                GitHub
              </a>
            </Button>
          </div>
        </div>

        <div className="relative flex flex-1 flex-col justify-center space-y-5 max-lg:pt-10 lg:pl-10">
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
              <div key={feature.title} className="flex gap-2.5 lg:gap-5">
                <Icon className="mt-1 size-4 shrink-0 text-foreground lg:size-5" />
                <div>
                  <h2 className="font-text font-semibold text-foreground">
                    {feature.title}
                  </h2>
                  <p className="max-w-76 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-12 max-lg:mx-6 md:mt-20 lg:container lg:mt-24">
        <Dialog.Root>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="group relative aspect-[16/9] w-full cursor-pointer overflow-hidden rounded-2xl border bg-muted text-left shadow-lg transition-shadow hover:shadow-xl"
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
    </section>
  );
};
