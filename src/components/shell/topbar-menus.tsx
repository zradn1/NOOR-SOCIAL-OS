"use client";

import { Bell, CheckCheck, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import { signOutAction } from "@/server/actions/auth";
import { markAllNotificationsReadAction } from "@/server/actions/notifications";
import type { NotificationItem } from "@/server/services/notifications";

const SEVERITY_DOT = {
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-danger",
} as const;

export function NotificationsMenu({ items, unread }: { items: NotificationItem[]; unread: number }) {
  const [pending, startTransition] = useTransition();
  const now = new Date();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <span className="relative">
            <Bell />
            {unread ? (
              <span className="absolute -top-1 -right-1.5 grid min-w-4 place-items-center rounded-full bg-gold-400 px-1 text-[9px] leading-4 font-semibold text-gold-ink">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
          <p className="text-[13px] font-medium text-fg">Notifications</p>
          {unread ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => void (await markAllNotificationsReadAction()))}
              className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-gold-300 disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-fg-muted">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto py-1 scrollbar-thin">
            {items.map((n) => {
              const body = (
                <div className={cn("flex gap-3 px-3.5 py-2.5", !n.readAt && "bg-gold-wash/40")}>
                  <span aria-hidden="true" className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", SEVERITY_DOT[n.severity])} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-[13px] text-fg">{n.title}</p>
                    {n.body ? <p className="line-clamp-2 text-xs text-fg-muted">{n.body}</p> : null}
                    <p className="text-2xs text-fg-faint">{formatRelative(n.createdAt, now)}</p>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <DropdownMenuItem asChild className="block rounded-none p-0">
                      <Link href={n.link}>{body}</Link>
                    </DropdownMenuItem>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({
  name,
  email,
  profileHref,
}: {
  name: string;
  email: string;
  profileHref: string;
}) {
  // The menu content unmounts on select, so the action is invoked directly
  // rather than through a <form> inside the portal.
  const [signingOut, startSignOut] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full transition-opacity hover:opacity-85"
        aria-label={`Account menu for ${name}`}
      >
        <Avatar name={name || email} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block truncate text-[13px] font-medium text-fg">{name || "Your account"}</span>
          <span className="block truncate text-xs font-normal text-fg-muted">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={profileHref}>
            <UserRound /> Profile & preferences
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          disabled={signingOut}
          onSelect={() => startSignOut(async () => void (await signOutAction()))}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
