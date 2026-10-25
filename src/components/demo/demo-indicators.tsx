import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

/**
 * Persistent banner rendered on every page of a demo workspace. Demo state must
 * be impossible to miss, so this banner cannot be dismissed.
 */
export function DemoBanner({ className }: { className?: string }) {
  return (
    <div
      role="note"
      aria-label="Demo workspace"
      className={cn(
        "demo-hatch flex items-center justify-center gap-2 border-b border-demo-line bg-demo-wash px-4 py-1.5 text-center text-xs text-fg-secondary",
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="size-3.5 shrink-0 text-demo" />
      <span>
        <strong className="font-semibold tracking-wide text-demo">DEMO WORKSPACE</strong>
        <span className="hidden sm:inline">
          {" "}
          · Accounts, metrics, and posts here are simulated. Nothing is connected to or published on any
          social platform.
        </span>
        <span className="sm:hidden"> · Simulated data only</span>
      </span>
    </div>
  );
}

export function DemoBadge({ className, label = "Demo" }: { className?: string; label?: string }) {
  return (
    <Badge tone="demo" className={className}>
      <FlaskConical aria-hidden="true" />
      {label}
    </Badge>
  );
}
