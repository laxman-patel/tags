"use client";

import Link from "next/link";
import { SignInButton, Show, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { TabNav } from "@/components/tab-nav";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-12 w-full max-w-[1200px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex size-5 items-center justify-center rounded bg-foreground font-mono text-[11px] font-bold text-background">
            t
          </span>
          Tags
        </Link>
        <div className="flex items-center gap-2">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="outline" size="sm">
                Sign in
              </Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1200px] px-6">
        <TabNav
          className="-ml-3"
          tabs={[
            { href: "/", label: "Spaces", also: ["/admin/spaces"] },
            { href: "/admin/approvals", label: "Approvals", prefix: true },
            { href: "/admin/audit", label: "Audit", prefix: true },
          ]}
        />
      </div>
    </header>
  );
}
