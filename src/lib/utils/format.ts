const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat("en");
const percent = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 });

/** 1,284 / 12.9K / 4.2M. Values under 10,000 keep full precision. */
export function formatCompact(value: number) {
  return Math.abs(value) < 10_000 ? plain.format(Math.round(value)) : compact.format(value);
}

/** Axis ticks: always compact so a scale never mixes "8,000" with "16K". */
export function formatAxisTick(value: number) {
  return compact.format(value);
}

export function formatNumber(value: number) {
  return plain.format(value);
}

/** Expects a ratio (0.042 → "4.2%"). */
export function formatPercent(ratio: number) {
  return percent.format(ratio);
}

/** Signed change: "+1.2K", "−340". Uses a true minus sign. */
export function formatSignedCompact(value: number) {
  if (value === 0) return "0";
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatCompact(Math.abs(value))}`;
}

export function formatSignedPercent(ratio: number) {
  if (ratio === 0) return "0%";
  const sign = ratio > 0 ? "+" : "−";
  return `${sign}${percent.format(Math.abs(ratio))}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "3 hours ago" / "in 2 days". `now` is explicit so callers control the clock. */
export function formatRelative(date: Date | string, now: Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.round((d.getTime() - now.getTime()) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return Math.abs(seconds) < 45 ? "just now" : rtf.format(Math.round(seconds / 60), "minute");
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
