"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { VIZ_AXIS, VIZ_GRID, VIZ_SURFACE } from "@/lib/platforms/registry";
import { formatAxisTick, formatCompact, formatPercent } from "@/lib/utils/format";
import { ChartFrame, ChartTooltipCard, type LegendItem } from "./chart-frame";
import type { ReactNode } from "react";

export type SeriesDef = { key: string; label: string; color: string };
export type TimePoint = { date: string } & Record<string, number | null | string>;

const dayLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const longDayLabel = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Dates are calendar days ("2026-10-25"), formatted in UTC so they never shift. */
export function formatDay(iso: string, long = false) {
  const d = new Date(`${iso}T00:00:00Z`);
  return (long ? longDayLabel : dayLabel).format(d);
}

function formatValue(value: number, format: "compact" | "percent") {
  return format === "percent" ? formatPercent(value) : formatCompact(value);
}

/**
 * Line (multi-series) or area (single series) over time. Missing values are
 * gaps, never zeros. Includes a crosshair tooltip and a table-view twin.
 */
export function TimeSeriesChart({
  title,
  description,
  data,
  series,
  format = "compact",
  height = 260,
  badge,
  emptyMessage = "No data for this period.",
}: {
  title: string;
  description?: ReactNode;
  data: TimePoint[];
  series: SeriesDef[];
  format?: "compact" | "percent";
  height?: number;
  badge?: ReactNode;
  emptyMessage?: string;
}) {
  const single = series.length === 1;
  const legend: LegendItem[] = series.map((s) => ({ key: s.key, label: s.label, color: s.color, mark: "line" }));
  const hasData = data.some((point) => series.some((s) => typeof point[s.key] === "number"));

  const tooltip = (props: TooltipContentProps) => {
    if (!props.active || !props.payload?.length) return null;
    const point = props.payload[0]?.payload as TimePoint | undefined;
    if (!point) return null;
    return (
      <ChartTooltipCard
        heading={formatDay(point.date, true)}
        rows={series.map((s) => {
          const v = point[s.key];
          return {
            key: s.key,
            label: s.label,
            color: s.color,
            value: typeof v === "number" ? formatValue(v, format) : "No data",
          };
        })}
      />
    );
  };

  const axes = (
    <>
      <CartesianGrid vertical={false} stroke={VIZ_GRID} strokeWidth={1} />
      <XAxis
        dataKey="date"
        tickFormatter={(d: string) => formatDay(d)}
        tick={{ fill: "#8f897d", fontSize: 11 }}
        tickLine={false}
        axisLine={{ stroke: VIZ_AXIS }}
        minTickGap={28}
        tickMargin={8}
      />
      <YAxis
        tickFormatter={(v: number) => (format === "percent" ? formatPercent(v) : formatAxisTick(v))}
        tick={{ fill: "#8f897d", fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        width={48}
        allowDecimals={format === "percent"}
      />
      <Tooltip
        content={tooltip}
        cursor={{ stroke: "#8b8f97", strokeWidth: 1 }}
        isAnimationActive={false}
      />
    </>
  );

  const table = (
    <Table>
      <THead>
        <tr>
          <TH>Date</TH>
          {series.map((s) => (
            <TH key={s.key} className="text-right">
              {s.label}
            </TH>
          ))}
        </tr>
      </THead>
      <TBody>
        {data.map((point) => (
          <TR key={point.date}>
            <TD>{formatDay(point.date, true)}</TD>
            {series.map((s) => {
              const v = point[s.key];
              return (
                <TD key={s.key} className="text-right tabular-nums">
                  {typeof v === "number" ? formatValue(v, format) : <span className="text-fg-faint">—</span>}
                </TD>
              );
            })}
          </TR>
        ))}
      </TBody>
    </Table>
  );

  return (
    <ChartFrame title={title} description={description} legend={legend} badge={badge} table={table}>
      {!hasData ? (
        <div className="grid place-items-center text-[13px] text-fg-muted" style={{ height }}>
          {emptyMessage}
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={`${title} chart. Switch to table view for exact values.`}>
          <ResponsiveContainer width="100%" height="100%">
            {single ? (
              <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`fill-${series[0]!.key}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={series[0]!.color} stopOpacity={0.14} />
                    <stop offset="100%" stopColor={series[0]!.color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                {axes}
                <Area
                  type="monotone"
                  dataKey={series[0]!.key}
                  name={series[0]!.label}
                  stroke={series[0]!.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill={`url(#fill-${series[0]!.key})`}
                  connectNulls={false}
                  activeDot={{ r: 4.5, fill: series[0]!.color, stroke: VIZ_SURFACE, strokeWidth: 2 }}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            ) : (
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                {axes}
                {series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    connectNulls={false}
                    dot={false}
                    activeDot={{ r: 4, fill: s.color, stroke: VIZ_SURFACE, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
