"use client";

import { Menu, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState, type ReactNode } from "react";
import { NoorLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import type { NavSection } from "./nav-config";
import { SidebarNav } from "./sidebar-nav";

/** Slide-over navigation for small screens. */
export function MobileNav({ sections, switcher }: { sections: NavSection[]; switcher: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-fade-in lg:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,86vw)] flex-col gap-6 border-r border-line bg-sunken p-4 shadow-[var(--shadow-overlay)] data-[state=open]:animate-fade-in lg:hidden">
          <div className="flex items-center justify-between">
            <NoorLogo />
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close navigation">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Workspace and organization sections</DialogPrimitive.Description>
          {switcher}
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
