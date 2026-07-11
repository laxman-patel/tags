import { ArrowRight } from "lucide-react";

import proofImage from "../../../features-images/generated/proof.webp";
import pullRequestImage from "../../../features-images/generated/pull-request.webp";
import spacesImage from "../../../features-images/generated/spaces.webp";
import { cn } from "./cn";
import { DashedLine } from "./dashed-line";
import { keepLastWordsTogether } from "./typography";
import { Card, CardContent } from "./ui";

const items = [
  {
    title: "One Space per channel",
    description:
      "Each channel keeps its own instructions, connections, tools, and memory.",
    image: spacesImage,
    alt: "Tags Spaces showing Slack channels with their own tools, connections, and memory",
    width: 1374,
    height: 1145,
    imageClassName: "object-cover object-top scale-[1.02]",
  },
  {
    title: "From thread to pull request",
    description:
      "Tags works in an isolated repo, makes the change, and opens a pull request.",
    image: pullRequestImage,
    alt: "Tags coding run completed with changed files, passing checks, and a pull request",
    width: 1400,
    height: 1120,
    imageClassName: "object-cover object-center scale-[1.02]",
  },
  {
    title: "Proof posted to the thread",
    description:
      "Ask for a demo and Tags records the real app, then shares the video in Slack.",
    image: proofImage,
    alt: "Tags Slack reply with an embedded video proof of a completed change",
    width: 1400,
    height: 933,
    imageClassName: "object-contain object-center",
  },
];

export const Features = () => {
  return (
    <section id="features" className="pb-14 md:pb-16 lg:pb-20">
      <div className="container">
        <div className="relative flex items-center justify-center">
          <DashedLine className="text-muted-foreground" />
          <span className="absolute bg-muted px-3 font-mono text-xs font-medium tracking-wide text-muted-foreground max-md:hidden">
            ONE AGENT PER CHANNEL
          </span>
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl items-center gap-3 md:gap-0 lg:mt-20 lg:grid-cols-2">
          <h2 className="text-pretty text-2xl tracking-tight md:text-3xl lg:text-4xl">
            Built for teams that live in{"\u00A0"}Slack
          </h2>
          <p className="leading-snug text-muted-foreground">
            {keepLastWordsTogether(
              "Mention @tags in any thread. It reads the full conversation, does the work, and stays scoped to that channel's Space.",
            )}
          </p>
        </div>

        <Card className="mt-8 overflow-hidden rounded-[22px] border-border/80 bg-background shadow-[0_1px_2px_rgba(16,24,40,0.03),0_24px_60px_-42px_rgba(16,24,40,0.35)] md:mt-12 lg:mt-16">
          <CardContent className="flex p-0 max-md:flex-col">
            {items.map((item, i) => (
              <div key={item.title} className="flex flex-1 max-md:flex-col">
                <div className="flex min-w-0 flex-1 flex-col px-4 pt-4 pb-5 md:px-5 md:pt-5 md:pb-5 lg:px-6 lg:pt-6">
                  <div className="relative aspect-[1.22/1] overflow-hidden rounded-xl bg-[#ececef]">
                    <img
                      src={item.image}
                      alt={item.alt}
                      width={item.width}
                      height={item.height}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className={cn(
                        "block h-full w-full select-none",
                        item.imageClassName,
                      )}
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-linear-to-t from-background via-background/20 to-transparent"
                    />
                  </div>

                  <div className="mt-auto flex min-h-14 items-center justify-between gap-3 pt-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-[19px] leading-snug font-semibold tracking-[-0.025em] md:text-[20px] lg:text-[21px]">
                        {item.title}
                      </h3>
                      <p className="sr-only">
                        {keepLastWordsTogether(item.description)}
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-background text-foreground shadow-[var(--shadow-2xs)]"
                    >
                      <ArrowRight className="size-4" strokeWidth={1.8} />
                    </span>
                  </div>
                </div>
                {i < items.length - 1 && (
                  <div className="relative hidden md:block">
                    <DashedLine orientation="vertical" />
                  </div>
                )}
                {i < items.length - 1 && (
                  <div className="relative block md:hidden">
                    <DashedLine orientation="horizontal" />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
