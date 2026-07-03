"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type TabItem = {
  href: string;
  label: string;
  /** Match nested routes too (default: exact match only). */
  prefix?: boolean;
  /** Additional path prefixes that count as active. */
  also?: string[];
};

export function TabNav({ tabs, className }: { tabs: TabItem[]; className?: string }) {
  const pathname = usePathname();

  function isActive(tab: TabItem) {
    if (tab.also?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
    if (tab.prefix) return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
    return pathname === tab.href;
  }

  return (
    <nav className={cn("flex items-center gap-0.5 overflow-x-auto", className)}>
      {tabs.map((tab) => {
        const active = isActive(tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative whitespace-nowrap px-3 pb-2.5 pt-1 text-sm transition-colors",
              active
                ? "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
