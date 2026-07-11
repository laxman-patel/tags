import approvalImage from "../../../features-images/generated/approval.webp";
import auditImage from "../../../features-images/generated/audit.webp";
import memoryImage from "../../../features-images/generated/memory.webp";
import scheduleImage from "../../../features-images/generated/scheduled-work.webp";
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
import { keepLastWordsTogether } from "./typography";

type LogoImage = {
  src: string;
  alt: string;
};

type ScreenshotImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
  className: string;
  objectClassName?: string;
};

type CapabilityItem = {
  title: string;
  description: string;
  logos?: LogoImage[];
  image?: ScreenshotImage;
  imageFirst?: boolean;
  className?: string;
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
      "GitHub, Linear, Notion and more through Composio. Each connection belongs to its Space and risky actions need approval.",
    logos,
    className:
      "flex-1 [&>.title-container]:mb-5 md:[&>.title-container]:mb-8 md:[&>.title-container]:translate-x-2 xl:[&>.title-container]:translate-x-4 [&>.title-container]:translate-x-0",
  },
  {
    title: "Memory that compounds.",
    description:
      "Tags remembers decisions per Space and packs the right context into every run.",
    image: {
      src: memoryImage,
      alt: "Tags saving a checkout decision to the Engineering Space memory",
      width: 1600,
      height: 533,
      className: "aspect-[3/1] w-full max-w-[540px]",
      objectClassName: "object-cover object-center",
    },
    className:
      "flex-1 [&>.title-container]:mb-5 md:[&>.title-container]:mb-9 [&>.image-container]:place-items-center",
  },
];

const bottomItems: CapabilityItem[] = [
  {
    title: "Scheduled work.",
    description: "Standups, digests, and checks on a schedule Tags runs.",
    image: {
      src: scheduleImage,
      alt: "Tags schedule showing recurring standups, digests, and checks",
      width: 1281,
      height: 805,
      className: "aspect-[8/5] w-full max-w-[340px]",
      objectClassName: "object-cover object-center",
    },
  },
  {
    title: "Approval stays human.",
    description:
      "Risky actions pause in Slack until someone approves or declines.",
    image: {
      src: approvalImage,
      alt: "Tags Slack approval card for a risky production deployment",
      width: 985,
      height: 328,
      className: "aspect-[3/1] w-full max-w-[360px]",
      objectClassName: "object-contain object-center",
    },
  },
  {
    title: "Every run is auditable.",
    description:
      "Every message, tool call, approval, artifact, and cost is recorded.",
    image: {
      src: auditImage,
      alt: "Tags run timeline showing tool calls, approval, artifact, outcome, and cost",
      width: 1374,
      height: 1145,
      className: "aspect-[1.2/1] w-full max-w-[320px]",
      objectClassName: "object-cover object-top",
    },
  },
];

export const Capabilities = () => {
  return (
    <section id="capabilities" className="overflow-hidden pb-20 lg:pb-28">
      <div>
        <h2 className="sr-only">Everything an agent needs to do real work</h2>

        <div>
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
                className="justify-start gap-5 md:pb-0 md:h-full [&>.title-container]:mb-0 [&>.title-container]:min-h-[4.75rem] md:[&>.title-container]:min-h-[5.25rem] [&>.image-container]:place-items-center"
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
  const title = (
    <div className="title-container text-balance">
      <h3 className="inline font-semibold">{item.title} </h3>
      <span className="text-muted-foreground">
        {" "}
        {keepLastWordsTogether(item.description)}
      </span>
    </div>
  );

  const media = item.logos ? (
    <LogoGrid logos={item.logos} />
  ) : item.image ? (
    <div className="image-container grid grid-cols-1 gap-4">
      <Screenshot {...item.image} />
    </div>
  ) : null;

  return (
    <div
      className={cn(
        "relative flex flex-col justify-between px-0 py-6 md:px-6 md:py-8",
        className,
        item.className,
      )}
    >
      {item.imageFirst ? (
        <>
          {media}
          {title}
        </>
      ) : (
        <>
          {title}
          {media}
        </>
      )}

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

const Screenshot = ({
  src,
  alt,
  width,
  height,
  className,
  objectClassName,
}: ScreenshotImage) => {
  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.04]",
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn(
          "block h-full w-full select-none",
          objectClassName ?? "object-contain object-center",
        )}
      />
    </div>
  );
};
