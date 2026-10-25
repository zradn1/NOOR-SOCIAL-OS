import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
    "transition-[background-color,border-color,color,box-shadow,opacity,filter] duration-150",
    "focus-visible:shadow-[var(--shadow-focus)] disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-[linear-gradient(180deg,var(--color-gold-300),var(--color-gold-400))] text-gold-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_1px_2px_rgb(0_0_0/0.45),0_8px_24px_-12px_rgb(201_164_106/0.6)] hover:brightness-110 active:brightness-95",
        secondary:
          "bg-surface-raised text-fg border border-line-strong hover:bg-surface-hover hover:border-silver-700",
        outline:
          "border border-line-strong text-fg-secondary hover:text-fg hover:border-silver-500 bg-transparent",
        ghost: "text-fg-secondary hover:text-fg hover:bg-surface-hover bg-transparent",
        danger:
          "bg-danger-wash text-danger border border-danger/30 hover:bg-danger/15 hover:border-danger/50",
        link: "text-gold-300 underline-offset-4 hover:underline hover:text-gold-200 px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px] [&_svg]:size-3.5",
        md: "h-9 px-4 text-sm [&_svg]:size-4",
        lg: "h-11 px-5 text-[15px] [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner className="absolute" label="Working" /> : null}
          <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
            {children}
          </span>
        </>
      )}
    </Comp>
  );
}
