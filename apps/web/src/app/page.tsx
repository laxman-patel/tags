import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import {
  MinimalCard,
  MinimalCardDescription,
  MinimalCardTitle,
} from "@/components/ui/minimal-card";

const ADMIN_LINKS = [
  {
    href: "/admin/spaces",
    title: "Spaces",
    description: "Map Slack channels to scoped agents and configure their tools.",
  },
  {
    href: "/admin/approvals",
    title: "Approvals",
    description: "Review and respond to pending human-in-the-loop requests.",
  },
  {
    href: "/admin/audit",
    title: "Audit",
    description: "Inspect every governed event across your organization.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Channel-native agent for Slack. Mention the bot in a mapped channel to start a run, then
        follow it live from the Slack link or its run page.
      </p>

      <div className="mt-8">
        <CodeBlock
          code={`@tags summarize the open threads in this channel`}
          language="slack"
        />
      </div>

      <h2 className="mt-12 text-sm font-medium text-muted-foreground">Admin</h2>
      <div className="mt-3 grid gap-3">
        {ADMIN_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="group">
            <MinimalCard className="p-4 transition-colors hover:dark:bg-neutral-800/60">
              <div className="flex items-center justify-between">
                <MinimalCardTitle className="mt-0 text-base">{link.title}</MinimalCardTitle>
                <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
              </div>
              <MinimalCardDescription className="mt-1 pb-0">
                {link.description}
              </MinimalCardDescription>
            </MinimalCard>
          </Link>
        ))}
      </div>
    </main>
  );
}
