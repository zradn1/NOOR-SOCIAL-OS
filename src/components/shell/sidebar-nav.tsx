"use client";

import {
  BarChart3,
  Bot,
  Briefcase,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  Link2,
  PenSquare,
  Send,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import type { NavIcon, NavSection } from "./nav-config";

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  accounts: Link2,
  content: PenSquare,
  calendar: CalendarDays,
  publishing: Send,
  analytics: BarChart3,
  assistant: Bot,
  clients: Briefcase,
  billing: CreditCard,
  settings: Settings,
  admin: ShieldCheck,
};

export function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="space-y-6">
      {sections.map((section) => (
        <div key={section.label} className="space-y-1">
          <p className="eyebrow px-3 pb-1.5">{section.label}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex h-9 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-surface-raised text-fg shadow-[var(--shadow-card)]"
                        : "text-fg-muted hover:bg-surface-raised/60 hover:text-fg-secondary",
                    )}
                  >
                    {active ? (
                      <span aria-hidden="true" className="absolute top-2 bottom-2 left-0 w-px rounded-full bg-gold-400" />
                    ) : null}
                    <Icon
                      aria-hidden="true"
                      className={cn("size-4 shrink-0", active ? "text-gold-300" : "text-fg-faint group-hover:text-fg-muted")}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
