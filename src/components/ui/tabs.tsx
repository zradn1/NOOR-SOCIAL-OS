"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex items-center gap-1 rounded-lg border border-line bg-sunken p-1", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-fg-muted transition-colors",
        "hover:text-fg data-[state=active]:bg-surface-raised data-[state=active]:text-fg data-[state=active]:shadow-[var(--shadow-card)]",
        "[&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

/** Route-backed tabs: each tab is a link and the active one follows the URL. */
export function NavTabs({
  items,
  className,
}: {
  items: { href: string; label: string; exact?: boolean }[];
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Section" className={cn("relative flex gap-5 overflow-x-auto border-b border-line scrollbar-thin", className)}>
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px shrink-0 border-b py-2.5 text-[13px] font-medium transition-colors",
              active ? "border-gold-400 text-fg" : "border-transparent text-fg-muted hover:text-fg-secondary",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
