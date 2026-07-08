import { DashedLine } from "./dashed-line";
import { Card, CardContent } from "./ui";

const items = [
  {
    title: "One Space per channel",
    description:
      "Each Slack channel gets its own agent — scoped tools, memory, and spend limits.",
    label: "spaces dashboard",
  },
  {
    title: "Approvals before actions",
    description:
      "External writes and sensitive tools pause in-thread until someone approves.",
    label: "slack approval card",
  },
  {
    title: "Every run, replayable",
    description:
      "Tool calls, artifacts, and token usage persisted — browse or export any run.",
    label: "run timeline",
  },
];

export const Features = () => {
  return (
    <section id="features" className="pb-20 lg:pb-28">
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
            Mention @tags in any thread. It reads the full conversation, does
            the work, and stays scoped to that channel&apos;s Space.
          </p>
        </div>

        <Card className="mt-8 rounded-3xl md:mt-12 lg:mt-16">
          <CardContent className="flex p-0 max-md:flex-col">
            {items.map((item, i) => (
              <div key={item.title} className="flex flex-1 max-md:flex-col">
                <div className="flex-1 p-4 pe-0! md:p-6">
                  <div className="relative aspect-[1.28/1] overflow-hidden">
                    <div className="grid h-full w-full place-items-center rounded-lg border border-dashed border-border bg-muted/60">
                      <span className="text-center font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                        {item.label}
                      </span>
                    </div>
                    <div className="absolute inset-0 z-10 bg-linear-to-t from-background via-transparent to-transparent" />
                  </div>

                  <div className="pt-5">
                    <h3 className="font-display text-lg leading-tight font-semibold tracking-tight">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
                      {item.description}
                    </p>
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
