import { OctagonAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-1 grid size-11 place-items-center rounded-full border border-line-strong bg-surface-raised">
          <Icon aria-hidden="true" className="size-5 text-silver-300" />
        </div>
      ) : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="max-w-md text-[13px] leading-relaxed text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this section. Try again in a moment.",
  reference,
  action,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  reference?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-danger/25 bg-danger-wash px-6 py-12 text-center",
        className,
      )}
    >
      <OctagonAlert aria-hidden="true" className="size-6 text-danger" />
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="max-w-md text-[13px] leading-relaxed text-fg-secondary">{description}</p>
      {reference ? <p className="font-mono text-2xs text-fg-muted">Reference: {reference}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton h-4", className)} />;
}

/** A loading placeholder shaped like a page: header plus a grid of cards. */
export function PageSkeleton({ cards = 4, label = "Loading" }: { cards?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-line bg-surface p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="h-72 rounded-lg border border-line bg-surface p-5">
        <Skeleton className="h-full w-full opacity-60" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
