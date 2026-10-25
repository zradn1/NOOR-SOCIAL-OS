"use client";

import type { ReactNode } from "react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { VIZ_SINGLE_SERIES } from "@/lib/platforms/registry";
import { formatCompact, formatPercent } from "@/lib/utils/format";
import { ChartFrame } from "./chart-frame";

export type BarItem = { key: string; label: string; icon?: ReactNode; value: number | null; note?: string };

/**
 * Horizontal bar comparison for nominal categories (one series → one color).
 * Bars are ≤ 24px with a 4px rounded data end, values sit at the bar tip, and
 * unavailable values say so instead of drawing a zero-length bar.
 */
export function BarListChart({
  title,
  description,
  items,
  format = "compact",
  badge,
  color = VIZ_SINGLE_SERIES,
}: {
  title: string;
  description?: ReactNode;
  items: BarItem[];
  format?: "compact" | "percent";
  badge?: ReactNode;
  color?: string;
}) {
  const max = Math.max(0, ...items.map((i) => i.value ?? 0));
  const fmt = (v: number) => (format === "percent" ? formatPercent(v) : formatCompact(v));

  const table = (
    <Table>
      <THead>
        <tr>
          <TH>{title}</TH>
          <TH className="text-right">Value</TH>
        </tr>
      </THead>
      <TBody>
        {items.map((item) => (
          <TR key={item.key}>
            <TD>
              <span className="flex items-center gap-2">
                {item.icon}
                {item.label}
              </span>
            </TD>
            <TD className="text-right tabular-nums">
              {item.value === null ? <span className="text-fg-faint">{item.note ?? "Unavailable"}</span> : fmt(item.value)}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );

  return (
    <ChartFrame title={title} description={description} badge={badge} table={table}>
      <ul className="space-y-3 px-3 py-1">
        {items.map((item) => {
          const pct = item.value !== null && max > 0 ? Math.max((item.value / max) * 100, 0.8) : 0;
          return (
            <li key={item.key} className="grid grid-cols-[minmax(7rem,9rem)_1fr] items-center gap-3">
              <span className="flex min-w-0 items-center gap-2 text-[13px] text-fg-secondary">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </span>
              {item.value === null ? (
                <span className="text-xs text-fg-faint">{item.note ?? "Unavailable"}</span>
              ) : (
                <span className="group flex items-center gap-2" title={`${item.label}: ${fmt(item.value)}`}>
                  <span
                    className="h-[18px] rounded-r-[4px] transition-opacity group-hover:opacity-85"
                    style={{ width: `calc(${pct}% - 3.5rem)`, minWidth: 3, backgroundColor: color }}
                  />
                  <span className="text-xs font-medium text-fg tabular-nums">{fmt(item.value)}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}
