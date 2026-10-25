"use client";

import { Briefcase, ChevronsUpDown, FlaskConical, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

export type SwitcherWorkspace = {
  id: string;
  slug: string;
  name: string;
  kind: "internal" | "client";
  isDemo: boolean;
  organizationId: string;
  organizationName: string;
};

export function WorkspaceSwitcher({
  current,
  workspaces,
  canCreateWorkspace,
}: {
  current: SwitcherWorkspace;
  workspaces: SwitcherWorkspace[];
  canCreateWorkspace: boolean;
}) {
  const router = useRouter();
  const groups = new Map<string, SwitcherWorkspace[]>();
  for (const ws of workspaces) {
    const key = `${ws.organizationId}|${ws.organizationName}`;
    groups.set(key, [...(groups.get(key) ?? []), ws]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-left transition-colors hover:border-line-strong hover:bg-surface-raised"
        aria-label={`Current workspace: ${current.name}. Switch workspace`}
      >
        <Avatar name={current.name} size="sm" square />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-fg">{current.name}</span>
          <span className="block truncate text-2xs text-fg-muted">{current.organizationName}</span>
        </span>
        {current.isDemo ? <FlaskConical aria-label="Demo workspace" className="size-3.5 text-demo" /> : null}
        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-fg-faint" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start">
        {[...groups.entries()].map(([key, items], index) => (
          <DropdownMenuGroup key={key}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{key.split("|")[1]}</DropdownMenuLabel>
            {items.map((ws) => (
              <DropdownMenuCheckItem
                key={ws.id}
                checked={ws.id === current.id}
                onSelect={() => router.push(`/w/${ws.slug}/dashboard`)}
              >
                <Avatar name={ws.name} size="sm" square />
                <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                {ws.isDemo ? (
                  <span className="rounded-full border border-demo-line px-1.5 text-[10px] text-demo">Demo</span>
                ) : ws.kind === "client" ? (
                  <Briefcase aria-label="Client workspace" className={cn("size-3.5")} />
                ) : null}
              </DropdownMenuCheckItem>
            ))}
          </DropdownMenuGroup>
        ))}
        <DropdownMenuSeparator />
        {canCreateWorkspace ? (
          <DropdownMenuItem asChild>
            <Link href={`/w/${current.slug}/clients`}>
              <Plus /> New workspace
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus /> New organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
