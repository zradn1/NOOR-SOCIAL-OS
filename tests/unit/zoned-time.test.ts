import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  isLocalDate,
  monthGrid,
  startOfWeek,
  utcToZoned,
  weekDays,
  zonedRangeToUtc,
  zonedToUtc,
} from "@/lib/time/zoned";

describe("zoned conversions", () => {
  it("converts wall-clock time in a zone to UTC", () => {
    expect(zonedToUtc("2026-10-25", "09:30", "UTC").toISOString()).toBe("2026-10-25T09:30:00.000Z");
    expect(zonedToUtc("2026-07-01", "09:30", "Europe/Paris").toISOString()).toBe("2026-07-01T07:30:00.000Z");
    expect(zonedToUtc("2026-01-15", "09:30", "Europe/Paris").toISOString()).toBe("2026-01-15T08:30:00.000Z");
    expect(zonedToUtc("2026-03-10", "20:00", "Asia/Dubai").toISOString()).toBe("2026-03-10T16:00:00.000Z");
  });

  it("round-trips through utcToZoned", () => {
    const instant = zonedToUtc("2026-11-02", "18:45", "America/New_York");
    expect(utcToZoned(instant, "America/New_York")).toEqual({ date: "2026-11-02", time: "18:45" });
  });

  it("handles the autumn DST change (Europe/Paris, 2026-10-25)", () => {
    // Clocks go back at 03:00 → 02:00; 09:00 is CET (UTC+1) after the change.
    expect(zonedToUtc("2026-10-25", "09:00", "Europe/Paris").toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(zonedToUtc("2026-10-24", "09:00", "Europe/Paris").toISOString()).toBe("2026-10-24T07:00:00.000Z");
  });

  it("moves a non-existent spring-forward time forward instead of failing", () => {
    // 2026-03-29 02:30 doesn't exist in Paris (02:00 → 03:00).
    const result = zonedToUtc("2026-03-29", "02:30", "Europe/Paris");
    expect(utcToZoned(result, "Europe/Paris").time).toBe("03:30");
  });

  it("builds a local day range spanning a DST change", () => {
    const { start, end } = zonedRangeToUtc("2026-10-25", "2026-10-25", "Europe/Paris");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });
});

describe("calendar arithmetic", () => {
  it("validates real dates only", () => {
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-13-01")).toBe(false);
  });

  it("adds days and months across boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("starts weeks on Monday", () => {
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19"); // Sunday → previous Monday
    expect(weekDays("2026-10-21")[0]).toBe("2026-10-19");
  });

  it("builds a 6-week month grid that contains the whole month", () => {
    const grid = monthGrid("2026-10-15");
    expect(grid).toHaveLength(6);
    expect(grid[0]![0]).toBe("2026-09-28");
    expect(grid.flat()).toContain("2026-10-31");
  });
});
