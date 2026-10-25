import { isMetricAvailable, METRICS, type Metric } from "@/lib/platforms/metrics";
import type { Platform } from "@/lib/platforms/registry";
import { isLocalDate } from "@/lib/time/zoned";

/** RFC 4180-style CSV parsing (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const ALIASES: Record<string, Metric | "date"> = {
  date: "date",
  day: "date",
  followers: "followers",
  subscribers: "followers",
  impressions: "impressions",
  reach: "reach",
  views: "views",
  video_views: "views",
  profile_views: "profile_views",
  profile_visits: "profile_views",
  likes: "likes",
  reactions: "likes",
  comments: "comments",
  replies: "comments",
  shares: "shares",
  reposts: "shares",
  saves: "saves",
  clicks: "clicks",
  link_clicks: "clicks",
  outbound_clicks: "clicks",
  watch_time_seconds: "watch_time_seconds",
};

export type ImportRow = { metricDate: string; values: Partial<Record<Metric, number>> };
export type ImportParseResult = {
  rows: ImportRow[];
  errors: string[];
  warnings: string[];
  columns: Metric[];
};

export const IMPORT_MAX_ROWS = 1000;

/**
 * Validates a metrics export for one account. Unknown columns and metrics the
 * platform doesn't provide are ignored with a warning; empty cells stay
 * missing (never zero).
 */
export function parseMetricsImport(text: string, platform: Platform, today: string): ImportParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], errors: ["The file needs a header row and at least one data row."], warnings, columns: [] };
  if (table.length - 1 > IMPORT_MAX_ROWS) {
    return { rows: [], errors: [`Import at most ${IMPORT_MAX_ROWS} rows at a time.`], warnings, columns: [] };
  }

  const header = table[0]!.map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const mapping = header.map((h) => ALIASES[h] ?? null);
  const dateIndex = mapping.indexOf("date");
  if (dateIndex === -1) return { rows: [], errors: ["Add a “date” column (YYYY-MM-DD)."], warnings, columns: [] };

  const unknown = header.filter((h, i) => mapping[i] === null && h);
  if (unknown.length) warnings.push(`Ignored unknown columns: ${unknown.join(", ")}.`);
  const unavailable = mapping.filter((m): m is Metric => m !== null && m !== "date" && !isMetricAvailable(platform, m));
  if (unavailable.length) warnings.push(`Ignored metrics this platform doesn't provide: ${[...new Set(unavailable)].join(", ")}.`);
  const columns = [...new Set(mapping.filter((m): m is Metric => m !== null && m !== "date" && isMetricAvailable(platform, m)))];
  if (!columns.length) return { rows: [], errors: ["No supported metric columns found."], warnings, columns };

  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const date = (cells[dateIndex] ?? "").trim();
    if (!isLocalDate(date)) return errors.push(`Row ${line}: “${date}” isn't a date in YYYY-MM-DD format.`);
    if (date > today) return errors.push(`Row ${line}: ${date} is in the future.`);
    if (seen.has(date)) return errors.push(`Row ${line}: ${date} appears more than once.`);
    seen.add(date);
    const values: Partial<Record<Metric, number>> = {};
    mapping.forEach((metric, i) => {
      if (!metric || metric === "date" || !columns.includes(metric)) return;
      const raw = (cells[i] ?? "").trim().replace(/[,\s_]/g, "");
      if (raw === "") return;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        errors.push(`Row ${line}: ${metric} must be a whole number ≥ 0 (got “${cells[i]}”).`);
        return;
      }
      if (n > 10_000_000_000) {
        errors.push(`Row ${line}: ${metric} looks too large.`);
        return;
      }
      values[metric] = n;
    });
    rows.push({ metricDate: date, values });
  });
  return { rows, errors: errors.slice(0, 20), warnings, columns };
}

export function importTemplate(platform: Platform) {
  const cols = METRICS.filter((m) => isMetricAvailable(platform, m));
  return `date,${cols.join(",")}\n`;
}
