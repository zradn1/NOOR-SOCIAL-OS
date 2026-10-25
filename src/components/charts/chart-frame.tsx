"use client";

import { BarChart3, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type LegendItem = { key: string; label: string; color: string; mark?: "line" | "rect" };

/**
 * Card chrome for a chart: title, legend (≥ 2 series), provenance slot, and a
 * chart/table toggle so every value is reachable without hovering.
 */
export function ChartFrame({
  title,
  description,
  legend,
  badge,
  table,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  legend?: LegendItem[];
  badge?: ReactNode;
  table: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section
      className={cn("rounded-lg border border-line bg-surface shadow-[var(--shadow-card)]", className)}
      aria-label={title}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0 space-y-1">
          <h2 className="text-[15px] font-medium text-fg">{title}</h2>
          {description ? <p className="text-[13px] text-fg-muted">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {badge}
          <div role="group" aria-label="View" className="flex rounded-md border border-line bg-sunken p-0.5">
            <button
              type="button"
              onClick={() => setView("chart")}
              aria-pressed={view === "chart"}
              className={cn(
                "grid size-7 place-items-center rounded text-fg-muted transition-colors hover:text-fg",
                view === "chart" && "bg-surface-raised text-fg",
              )}
            >
              <BarChart3 className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Chart view</span>
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              aria-pressed={view === "table"}
              className={cn(
                "grid size-7 place-items-center rounded text-fg-muted transition-colors hover:text-fg",
                view === "table" && "bg-surface-raised text-fg",
              )}
            >
              <Table2 className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Table view</span>
            </button>
          </div>
        </div>
      </header>
      {legend && legend.length >= 2 && view === "chart" ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 pt-3" aria-label="Legend">
          {legend.map((item) => (
            <li key={item.key} className="flex items-center gap-1.5 text-xs text-fg-secondary">
              <span
                aria-hidden="true"
                className={cn(item.mark === "rect" ? "size-2.5 rounded-[2px]" : "h-0.5 w-3 rounded-full")}
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="px-2 pt-3 pb-4 sm:px-3">{view === "chart" ? children : <div className="px-2">{table}</div>}</div>
    </section>
  );
}

/** Tooltip body: values lead, series names follow, keyed by a short line. */
export function ChartTooltipCard({
  heading,
  rows,
}: {
  heading: string;
  rows: { key: string; label: string; color: string; value: string }[];
}) {
  return (
    <div className="min-w-40 rounded-md border border-line-strong bg-surface-overlay px-3 py-2.5 shadow-[var(--shadow-overlay)]">
      <p className="mb-1.5 text-2xs text-fg-muted">{heading}</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="text-[13px] font-semibold text-fg tabular-nums">{row.value}</span>
            <span className="text-xs text-fg-muted">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
