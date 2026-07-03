"use client";

import { use, type ReactNode } from "react";
import Link from "next/link";
import { Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TabNav } from "@/components/tab-nav";
import { SpaceConfigProvider, useSpaceConfig } from "./space-config";

function SpaceChrome({ children }: { children: ReactNode }) {
  const { space, spaceId, configVersion, message } = useSpaceConfig();
  const base = `/admin/spaces/${spaceId}`;

  return (
    <>
      <div className="border-b border-border bg-card/40">
        <div className="mx-auto w-full max-w-[1200px] px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-6 pt-6">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Link href="/" className="transition-colors hover:text-foreground">
                  Spaces
                </Link>
                <span>/</span>
                <span className="text-foreground">{space?.slug ?? "…"}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {space?.name ?? "…"}
                </h1>
                {space && (
                  <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                    <Hash className="size-3" />
                    {space.externalSpaceId}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">opencode</Badge>
              {configVersion && <Badge variant="outline">config v{configVersion}</Badge>}
            </div>
          </div>
          <TabNav
            className="-ml-3"
            tabs={[
              { href: base, label: "Overview" },
              { href: `${base}/tools`, label: "Tools" },
              { href: `${base}/codebase`, label: "Codebase" },
              { href: `${base}/memory`, label: "Memory" },
              { href: `${base}/schedules`, label: "Schedules" },
              { href: `${base}/usage`, label: "Usage" },
            ]}
          />
        </div>
      </div>
      <main className="mx-auto w-full max-w-[1200px] px-6 py-8">
        {message && (
          <div className="mb-6 rounded-md border border-border bg-card px-4 py-2.5 text-sm">
            {message}
          </div>
        )}
        {children}
      </main>
    </>
  );
}

export default function SpaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = use(params);
  return (
    <SpaceConfigProvider spaceId={spaceId}>
      <SpaceChrome>{children}</SpaceChrome>
    </SpaceConfigProvider>
  );
}
