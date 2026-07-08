import { ChevronRight } from "lucide-react";

import { DashedLine } from "./dashed-line";
import { Card, CardContent } from "./ui";

const items = [
  {
    title: "A Space for every channel",
    label: "spaces dashboard",
  },
  {
    title: "Approvals before actions",
    label: "slack approval card",
  },
  {
    title: "Every run, replayable",
    label: "run timeline",
  },
];

export const Features = () => {
  return (
    <section id="feature-modern-teams" className="pb-28 lg:pb-32">
      <div className="container">
        <div className="relative flex items-center justify-center">
          <DashedLine className="text-muted-foreground" />
          <span className="absolute bg-muted px-3 font-mono text-sm font-medium tracking-wide text-muted-foreground max-md:hidden">
            ONE AGENT PER CHANNEL
          </span>
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl items-center gap-3 md:gap-0 lg:mt-24 lg:grid-cols-2">
          <h2 className="text-2xl tracking-tight md:text-4xl lg:text-5xl">
            Made for teams that live in Slack
          </h2>
          <p className="leading-snug text-muted-foreground">
            Every channel gets its own Space — an agent with its own tools,
            memory, and rules. #support and #eng never blur together.
          </p>
        </div>

        <Card className="mt-8 rounded-3xl md:mt-12 lg:mt-20">
          <CardContent className="flex p-0 max-md:flex-col">
            {items.map((item, i) => (
              <div key={item.title} className="flex flex-1 max-md:flex-col">
                <div className="flex-1 p-4 pe-0! md:p-6">
                  <div className="relative aspect-[1.28/1] overflow-hidden">
                    <div className="grid h-full w-full place-items-center rounded-lg border border-dashed bg-muted/60">
                      <span className="text-center font-mono text-xs uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </span>
                    </div>
                    <div className="absolute inset-0 z-10 bg-linear-to-t from-background via-transparent to-transparent" />
                  </div>

                  <a
                    href="#"
                    className="group flex items-center justify-between gap-4 pe-4 pt-4 md:pe-6 md:pt-6"
                  >
                    <h3 className="font-display max-w-60 text-2xl leading-tight font-bold tracking-tight">
                      {item.title}
                    </h3>
                    <div className="rounded-full border p-2">
                      <ChevronRight className="size-6 transition-transform group-hover:translate-x-1 lg:size-9" />
                    </div>
                  </a>
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
