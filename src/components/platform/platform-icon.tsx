import type { SVGProps } from "react";
import { PLATFORM_META, type Platform } from "@/lib/platforms/registry";
import { cn } from "@/lib/utils/cn";

/*
 * Simplified monochrome glyphs. Platform names and marks are trademarks of their
 * owners and are used only to identify the destination platform.
 */
const GLYPHS: Record<Platform, (p: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  instagram: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  tiktok: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M14.2 3h3a4.6 4.6 0 0 0 3.8 4v3.1a7.6 7.6 0 0 1-3.8-1.2V15a6 6 0 1 1-6-6v3.2a2.8 2.8 0 1 0 3 2.8V3Z" />
    </svg>
  ),
  facebook: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 2.5a9.5 9.5 0 0 0-1.5 18.9v-6.7H8.1V12h2.4V9.9c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.5V12h2.6l-.4 2.7h-2.2v6.7A9.5 9.5 0 0 0 12 2.5Z" />
    </svg>
  ),
  youtube: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.2 9.3v5.4l4.6-2.7-4.6-2.7Z" fill="currentColor" />
    </svg>
  ),
  linkedin: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 10.8v5.7M8 7.6v.01M11.5 16.5v-5.7M11.5 13.4c0-1.6 1-2.6 2.3-2.6 1.4 0 2.2.9 2.2 2.6v3.1" />
    </svg>
  ),
  x: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M4 4h4.6l11.4 16h-4.6L4 4Z" />
      <path d="M18.6 4h1.9l-6.3 7.2-1-1.4L18.6 4ZM10.8 13.3l1 1.4L5.4 20H3.5l7.3-6.7Z" />
    </svg>
  ),
  pinterest: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.4 20.5 12 13.4M10.9 15.3c.6.4 1.3.6 2 .6 2.2 0 3.8-1.9 3.8-4.4 0-2.4-2-4.2-4.6-4.2-2.8 0-4.6 2-4.6 4.2 0 1 .4 2 1.2 2.4" />
    </svg>
  ),
};

export function PlatformIcon({
  platform,
  className,
  title,
}: {
  platform: Platform;
  className?: string;
  title?: string;
}) {
  const Glyph = GLYPHS[platform];
  return (
    <Glyph
      className={cn("size-4 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    />
  );
}

/** Icon in a hairline tile with the platform's chart color as a thin ring. */
export function PlatformBadgeIcon({
  platform,
  size = "md",
  className,
}: {
  platform: Platform;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const meta = PLATFORM_META[platform];
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center rounded-md border border-line-strong bg-surface-raised text-silver-100",
        size === "sm" && "size-7 [&_svg]:size-3.5",
        size === "md" && "size-9 [&_svg]:size-4",
        size === "lg" && "size-11 [&_svg]:size-5",
        className,
      )}
    >
      <PlatformIcon platform={platform} title={meta.name} />
      <span
        aria-hidden="true"
        className="absolute -bottom-px left-1/2 h-px w-1/2 -translate-x-1/2"
        style={{ backgroundColor: meta.vizColor }}
      />
    </span>
  );
}
