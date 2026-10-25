import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export const fieldControlClass = cn(
  "w-full rounded-md border border-line-strong bg-sunken px-3 text-sm text-fg placeholder:text-fg-faint",
  "transition-[border-color,box-shadow] duration-150",
  "hover:border-silver-700 focus-visible:border-line-focus focus-visible:shadow-[var(--shadow-focus)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-[invalid=true]:border-danger/60 aria-[invalid=true]:focus-visible:border-danger",
);

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} className={cn(fieldControlClass, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(fieldControlClass, "min-h-24 resize-y py-2 leading-relaxed scrollbar-thin", className)}
      {...props}
    />
  );
}

/**
 * Native select, styled. Native controls keep keyboard, screen reader, and
 * mobile picker behaviour correct without extra JavaScript.
 */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  // A fixed-width select shrink-wraps its wrapper so the chevron stays inside it.
  const fixedWidth = /(^|\s)w-(?!full)/.test(className ?? "");
  return (
    <div className={fixedWidth ? "relative inline-block" : "relative"}>
      <select
        className={cn(fieldControlClass, "h-9 cursor-pointer appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-fg-muted"
      >
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  // The check mark is a sibling SVG revealed with `peer-checked`, so the
  // filled state never depends on merging background utilities.
  return (
    <span className={cn("relative inline-grid size-4 shrink-0 place-items-center", className)}>
      <input
        type="checkbox"
        className={cn(
          "peer size-4 cursor-pointer appearance-none rounded-xs border border-line-strong bg-sunken transition-colors",
          "checked:border-gold-400 checked:bg-gold-400 hover:border-silver-500",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        {...props}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute size-3 text-gold-ink opacity-0 peer-checked:opacity-100"
      >
        <path d="M4 8.5l2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
