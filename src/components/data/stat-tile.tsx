import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { MetricProvenance } from "@/lib/analytics/data-source";
import { cn } from "@/lib/utils/cn";
import { formatCompact, formatPercent, formatSignedCompact, formatSignedPercent } from "@/lib/utils/format";
import { DataSourceBadge } from "./data-source-badge";

export type StatDelta = {
  /** Absolute change, or a ratio when `format` is "percent". */
  value: number;
  /** Named comparison period, e.g. "vs previous 30 days". */
  period: string;
  upIsGood?: boolean;
};

/**
 * Stat tile (dataviz contract): label · value · optional delta · provenance.
 * A null value renders as "Unavailable" with the reason. A missing metric is
 * never shown as zero.
 */
export function StatTile({
  label,
  value,
  format = "compact",
  delta,
  source,
  unavailableReason = "Not provided for the selected accounts.",
  footer,
  className,
}: {
  label: string;
  value: number | null;
  format?: "compact" | "percent";
  delta?: StatDelta | null;
  source: MetricProvenance;
  unavailableReason?: string;
  footer?: ReactNode;
  className?: string;
}) {
  const available = value !== null && source !== "unavailable";
  const formatted = available ? (format === "percent" ? formatPercent(value) : formatCompact(value)) : null;

  let deltaNode: ReactNode = null;
  if (available && delta) {
    const direction = delta.value === 0 ? 0 : delta.value > 0 ? 1 : -1;
    const good = direction === 0 ? null : (direction > 0) === (delta.upIsGood ?? true);
    const Icon = direction === 0 ? Minus : direction > 0 ? ArrowUpRight : ArrowDownRight;
    deltaNode = (
      <p className="flex items-center gap-1 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 font-medium",
            good === null ? "text-fg-muted" : good ? "text-success" : "text-danger",
          )}
        >
          <Icon aria-hidden="true" className="size-3.5" />
          {format === "percent" ? formatSignedPercent(delta.value) : formatSignedCompact(delta.value)}
        </span>
        <span className="text-fg-muted">{delta.period}</span>
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-32 flex-col justify-between gap-3 rounded-lg border border-line bg-surface bg-[linear-gradient(180deg,rgb(244_239_228/0.03),transparent_50%)] p-5 shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] text-fg-muted">{label}</p>
        <DataSourceBadge source={available ? source : "unavailable"} />
      </div>
      <div className="space-y-1.5">
        {available ? (
          <p className="text-[1.75rem] leading-none font-semibold tracking-tight text-fg">{formatted}</p>
        ) : (
          <Tooltip content={unavailableReason}>
            <p tabIndex={0} className="cursor-help text-lg leading-none font-medium text-fg-faint">
              Unavailable
            </p>
          </Tooltip>
        )}
        {deltaNode}
        {footer}
      </div>
    </div>
  );
}
