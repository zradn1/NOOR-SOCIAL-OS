import { describe, expect, it } from "vitest";
import { freshnessOf } from "@/lib/analytics/data-source";
import { formatAxisTick, formatCompact, formatRelative, formatSignedCompact } from "@/lib/utils/format";
import { AppError, fromDatabaseError, toAppError } from "@/server/errors";

describe("database error mapping", () => {
  it("maps plan limits to LIMIT_EXCEEDED with a readable message", () => {
    const e = fromDatabaseError({ code: "P0001", message: "limit_exceeded:workspaces" });
    expect(e?.code).toBe("LIMIT_EXCEEDED");
    expect(e?.publicMessage).toMatch(/workspaces/);
  });

  it("maps authorization failures to FORBIDDEN", () => {
    expect(fromDatabaseError({ code: "42501", message: "permission denied for table x" })?.code).toBe("FORBIDDEN");
  });

  it("maps plan features and invitation problems", () => {
    expect(fromDatabaseError({ code: "P0001", message: "plan_feature:client_workspaces" })?.code).toBe("PLAN_FEATURE");
    expect(fromDatabaseError({ code: "P0001", message: "invalid:invitation_expired" })?.publicMessage).toMatch(/expired/);
  });

  it("never leaks unknown errors", () => {
    const e = toAppError(new Error("connection to 10.0.0.5 refused, password=hunter2"));
    expect(e.code).toBe("INTERNAL");
    expect(e.publicMessage).not.toMatch(/10\.0|hunter2/);
  });

  it("passes AppErrors through unchanged", () => {
    const original = new AppError("RATE_LIMITED", "Slow down");
    expect(toAppError(original)).toBe(original);
  });
});

describe("formatting", () => {
  it("keeps precision under 10K and compacts above", () => {
    expect(formatCompact(9_874)).toBe("9,874");
    expect(formatCompact(128_430)).toBe("128.4K");
    expect(formatAxisTick(8_000)).toBe("8K");
  });

  it("uses a true minus sign for negative deltas", () => {
    expect(formatSignedCompact(-340)).toBe("−340");
    expect(formatSignedCompact(1_200)).toBe("+1,200");
  });

  it("formats relative time against an explicit clock", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    expect(formatRelative("2026-10-25T09:00:00Z", now)).toBe("3 hours ago");
    expect(formatRelative("2026-10-27T12:00:00Z", now)).toBe("in 2 days");
  });

  it("classifies data freshness", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    expect(freshnessOf("2026-10-25T02:00:00Z", now)).toBe("fresh");
    expect(freshnessOf("2026-10-23T20:00:00Z", now)).toBe("stale");
    expect(freshnessOf("2026-10-20T00:00:00Z", now)).toBe("outdated");
    expect(freshnessOf(null, now)).toBe("never");
  });
});
