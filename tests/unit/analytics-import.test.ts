import { describe, expect, it } from "vitest";
import { importTemplate, parseCsv, parseMetricsImport } from "@/lib/analytics/csv";

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, CRLF, BOM, and blank lines", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n1,2')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["1", "2"],
    ]);
  });
});

describe("metrics import validation", () => {
  const today = "2026-10-25";

  it("maps platform-specific column names and keeps empty cells missing", () => {
    const result = parseMetricsImport("Date,Subscribers,Views,Likes\n2026-10-01,1200,,40\n", "youtube", today);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([{ metricDate: "2026-10-01", values: { followers: 1200, likes: 40 } }]);
  });

  it("ignores metrics the platform doesn't provide, with a warning", () => {
    const result = parseMetricsImport("date,followers,reach,impressions\n2026-10-01,10,20,30\n", "youtube", today);
    expect(result.rows[0]!.values).toEqual({ followers: 10 });
    expect(result.warnings.join(" ")).toMatch(/reach, impressions/);
  });

  it("rejects bad dates, future dates, duplicates, and non-integers", () => {
    const csv = "date,followers\n2026-13-01,1\n2027-01-01,1\n2026-10-02,1\n2026-10-02,2\n2026-10-03,1.5\n2026-10-04,-3\n";
    const { errors } = parseMetricsImport(csv, "instagram", today);
    expect(errors).toHaveLength(5);
    expect(errors.join(" ")).toMatch(/isn't a date|future|more than once|whole number/);
  });

  it("requires a date column and at least one supported metric", () => {
    expect(parseMetricsImport("day_of,followers\n1,2\n", "instagram", today).errors[0]).toMatch(/date/);
    expect(parseMetricsImport("date,bogus\n2026-10-01,2\n", "instagram", today).errors[0]).toMatch(/No supported metric/);
  });

  it("accepts thousands separators", () => {
    expect(parseMetricsImport('date,followers\n2026-10-01,"12,400"\n', "instagram", today).rows[0]!.values.followers).toBe(12400);
  });

  it("builds a template with only the platform's metrics", () => {
    expect(importTemplate("tiktok")).toBe("date,followers,views,likes,comments,shares\n");
  });
});
