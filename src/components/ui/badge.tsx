import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-line-strong bg-surface-raised text-fg-secondary",
        gold: "border-gold-400/35 bg-gold-wash text-gold-300",
        silver: "border-silver-700 bg-transparent text-silver-300",
        success: "border-success/30 bg-success-wash text-success",
        warning: "border-warning/30 bg-warning-wash text-warning",
        danger: "border-danger/30 bg-danger-wash text-danger",
        info: "border-info/30 bg-info-wash text-info",
        demo: "border-demo-line bg-demo-wash text-demo",
      },
      size: {
        sm: "h-5 px-2 text-2xs",
        md: "h-6 px-2.5 text-xs",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({
  className,
  tone,
  size,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

/** A small dot used inside badges and legends to signal state. */
export function StatusDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("size-1.5 rounded-full bg-current", className)} />;
}
