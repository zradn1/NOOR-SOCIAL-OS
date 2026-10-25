import { TZDate } from "@date-fns/tz";

/**
 * Time-zone helpers. Schedules are stored as UTC instants plus the IANA zone
 * the user chose them in; everything shown to people is rendered in the
 * workspace's zone. Calendar days are "YYYY-MM-DD" strings in that zone.
 */

export type LocalDate = string; // YYYY-MM-DD
export type LocalTime = string; // HH:mm

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function isLocalTime(value: unknown): value is LocalTime {
  return typeof value === "string" && TIME_RE.test(value);
}

/**
 * Converts a wall-clock date and time in `timeZone` to a UTC instant. In a DST
 * gap (a time that doesn't exist) the result moves forward by the gap.
 */
export function zonedToUtc(date: LocalDate, time: LocalTime, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, timeZone).getTime());
}

/** The wall-clock date and time of an instant in `timeZone`. */
export function utcToZoned(instant: Date | string, timeZone: string): { date: LocalDate; time: LocalTime } {
  const t = new TZDate(typeof instant === "string" ? Date.parse(instant) : instant.getTime(), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`,
    time: `${pad(t.getHours())}:${pad(t.getMinutes())}`,
  };
}

export function todayIn(timeZone: string, now: Date): LocalDate {
  return utcToZoned(now, timeZone).date;
}

/** Pure calendar arithmetic on YYYY-MM-DD strings (no time zone involved). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function dayOfWeek(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}

export function startOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(date: LocalDate, months: number): LocalDate {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
}

/** The 6×7 grid of days shown for the month containing `date` (weeks start Monday). */
export function monthGrid(date: LocalDate): LocalDate[][] {
  const first = startOfWeek(startOfMonth(date));
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
}

export function weekDays(date: LocalDate): LocalDate[] {
  const first = startOfWeek(date);
  return Array.from({ length: 7 }, (_, d) => addDays(first, d));
}

/** UTC bounds of [fromDate 00:00, toDate+1 00:00) in `timeZone`. */
export function zonedRangeToUtc(fromDate: LocalDate, toDate: LocalDate, timeZone: string) {
  return { start: zonedToUtc(fromDate, "00:00", timeZone), end: zonedToUtc(addDays(toDate, 1), "00:00", timeZone) };
}

export function formatInZone(instant: Date | string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en", { timeZone, ...options }).format(typeof instant === "string" ? new Date(instant) : instant);
}

/** Short zone label for display, e.g. "GMT+2" or "CET". */
export function zoneAbbreviation(timeZone: string, at: Date) {
  const part = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}
