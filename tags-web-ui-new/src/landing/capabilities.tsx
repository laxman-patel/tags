import asanaLogo from "./logos/asana.svg";
import confluenceLogo from "./logos/confluence.svg";
import driveLogo from "./logos/drive.svg";
import excelLogo from "./logos/excel.svg";
import jiraLogo from "./logos/jira.svg";
import mondayLogo from "./logos/monday.svg";
import notionLogo from "./logos/notion.svg";
import wordLogo from "./logos/word.svg";
import { cn } from "./cn";
import { DashedLine } from "./dashed-line";

type LogoImage = {
  src: string;
  alt: string;
};

type PlaceholderImage = {
  label: string;
  className: string;
};

type CapabilityItem = {
  title: string;
  description: string;
  logos?: LogoImage[];
  placeholder?: PlaceholderImage;
  className: string;
};

const logos = [
  { src: jiraLogo, alt: "Jira logo" },
  { src: notionLogo, alt: "Notion logo" },
  { src: asanaLogo, alt: "Asana logo" },
  { src: driveLogo, alt: "Google Drive logo" },
  { src: mondayLogo, alt: "Monday logo" },
  { src: excelLogo, alt: "Excel logo" },
  { src: confluenceLogo, alt: "Confluence logo" },
  { src: wordLogo, alt: "Word logo" },
];

const topItems: CapabilityItem[] = [
  {
    title: "Connect the tools you already use.",
    description:
      "GitHub, Linear, Notion and more through Composio — authorized per Space, gated by approvals.",
    logos,
    className:
      "flex-1 [&>.title-container]:mb-5 md:[&>.title-container]:mb-8 md:[&>.title-container]:translate-x-2 xl:[&>.title-container]:translate-x-4 [&>.title-container]:translate-x-0",
  },
  {
    title: "Memory that compounds.",
    description:
      "Tags remembers decisions per Space and packs the right context into every run.",
    placeholder: {
      label: "memory browser",
      className: "aspect-[495/186] w-full max-w-[495px]",
    },
    className:
      "flex-1 [&>.title-container]:mb-5 md:[&>.title-container]:mb-8 xl:[&>.image-container]:translate-x-6 [&>.image-container]:translate-x-2",
  },
];

const bottomItems: CapabilityItem[] = [
  {
    title: "Schedules.",
    description:
      "Recurring runs — standups, digests, checks — on a cron the agent maintains.",
    placeholder: {
      label: "schedule list",
      className: "aspect-[305/280] w-full max-w-[305px]",
    },
    className:
      "[&>.title-container]:mb-5 md:[&>.title-container]:mb-8 xl:[&>.image-container]:translate-x-6 [&>.image-container]:translate-x-2",
  },
  {
    title: "Spend tracking.",
    description:
      "Token usage and cost per Space, per run, with monthly budgets enforced.",
    placeholder: {
      label: "spend dashboard",
      className: "aspect-[320/103] w-full max-w-[320px]",
    },
    className:
      "justify-normal [&>.title-container]:mb-5 md:[&>.title-container]:mb-0 [&>.image-container]:flex-1 md:[&>.image-container]:place-items-center md:[&>.image-container]:-translate-y-3",
  },
  {
    title: "Audit everything.",
    description: "Every action, approval, and tool call is logged and exportable.",
    placeholder: {
      label: "audit log",
      className: "aspect-[305/280] w-full max-w-[305px]",
    },
    className:
      "[&>.title-container]:mb-5 md:[&>.title-container]:mb-8 xl:[&>.image-container]:translate-x-6 [&>.image-container]:translate-x-2",
  },
];

export const Capabilities = () => {
  return (
    <section id="capabilities" className="overflow-hidden pb-20 lg:pb-28">
      <div>
        <h2 className="container text-center text-3xl tracking-tight text-balance sm:text-4xl md:text-4xl lg:text-5xl">
          Everything an agent needs to do real work
        </h2>

        <div className="mt-8 md:mt-12 lg:mt-16">
          <DashedLine
            orientation="horizontal"
            className="container scale-x-105"
          />

          <div className="relative container flex max-md:flex-col">
            {topItems.map((item, i) => (
              <Item
                key={item.title}
                item={item}
                isLast={i === topItems.length - 1}
              />
            ))}
          </div>
          <DashedLine
            orientation="horizontal"
            className="container max-w-7xl scale-x-110"
          />

          <div className="relative container grid max-w-7xl md:grid-cols-3">
            {bottomItems.map((item, i) => (
              <Item
                key={item.title}
                item={item}
                isLast={i === bottomItems.length - 1}
                className="md:pb-0"
              />
            ))}
          </div>
        </div>
        <DashedLine
          orientation="horizontal"
          className="container max-w-7xl scale-x-110"
        />
      </div>
    </section>
  );
};

type ItemProps = {
  item: CapabilityItem;
  isLast?: boolean;
  className?: string;
};

const Item = ({ item, isLast, className }: ItemProps) => {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between px-0 py-6 md:px-6 md:py-8",
        className,
        item.className,
      )}
    >
      <div className="title-container text-balance">
        <h3 className="inline font-semibold">{item.title} </h3>
        <span className="text-muted-foreground"> {item.description}</span>
      </div>

      {item.logos ? (
        <LogoGrid logos={item.logos} />
      ) : item.placeholder ? (
        <div className="image-container grid grid-cols-1 gap-4">
          <Placeholder {...item.placeholder} />
        </div>
      ) : null}

      {!isLast && (
        <>
          <DashedLine
            orientation="vertical"
            className="absolute top-0 right-0 max-md:hidden"
          />
          <DashedLine
            orientation="horizontal"
            className="absolute inset-x-0 bottom-0 md:hidden"
          />
        </>
      )}
    </div>
  );
};

const LogoGrid = ({ logos }: { logos: LogoImage[] }) => {
  return (
    <div className="relative overflow-hidden">
      <div className="flex flex-col gap-5">
        <div className="flex translate-x-4 justify-end gap-5">
          {logos.slice(0, 4).map((logo) => (
            <div
              key={logo.alt}
              className="grid aspect-square size-16 place-items-center rounded-2xl bg-background p-2 shadow-[var(--shadow-button)] lg:size-20"
            >
              <img
                src={logo.src}
                alt={logo.alt}
                width={48}
                height={48}
                className="object-contain object-left-top"
              />
            </div>
          ))}
        </div>
        <div className="flex -translate-x-4 gap-5">
          {logos.slice(4).map((logo) => (
            <div
              key={logo.alt}
              className="grid aspect-square size-16 place-items-center rounded-2xl bg-background shadow-[var(--shadow-button)] lg:size-20"
            >
              <img
                src={logo.src}
                alt={logo.alt}
                width={48}
                height={48}
                className="object-contain object-left-top"
              />
            </div>
          ))}
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-linear-to-r from-muted/80 to-transparent lg:w-24"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-linear-to-l from-muted/80 to-transparent lg:w-24"
      />
    </div>
  );
};

const Placeholder = ({ label, className }: PlaceholderImage) => {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-lg border border-dashed border-border bg-muted/60",
        className,
      )}
    >
      <span className="text-center font-mono text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
};
