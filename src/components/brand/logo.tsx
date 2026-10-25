"use client";

import { useId } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The NOOR mark: a crescent of light inside a hairline ring. Gradient ids are
 * unique per instance: the logo appears more than once per page (desktop
 * sidebar + mobile drawer), and a shared id inside a hidden subtree renders
 * nothing.
 */
export function NoorMark({ className }: { className?: string }) {
  const id = useId();
  const ring = `${id}-ring`;
  const light = `${id}-light`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <defs>
        <linearGradient id={ring} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#e6e7ea" />
          <stop offset="0.55" stopColor="#8b8f97" />
          <stop offset="1" stopColor="#c9a46a" />
        </linearGradient>
        <linearGradient id={light} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f3e9d6" />
          <stop offset="1" stopColor="#c9a46a" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14.5" fill="#121211" stroke={`url(#${ring})`} strokeWidth="1" />
      <path d="M19.5 7.8a8.6 8.6 0 1 0 0 16.4 7 7 0 0 1 0-16.4Z" fill={`url(#${light})`} />
    </svg>
  );
}

export function NoorLogo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <NoorMark />
      {compact ? null : (
        <span className="flex flex-col leading-none">
          <span className="metal-text text-[13px] font-semibold tracking-[0.28em]">NOOR</span>
          <span className="mt-1 text-[9px] font-medium tracking-[0.34em] text-fg-muted">SOCIAL OS</span>
        </span>
      )}
    </span>
  );
}
