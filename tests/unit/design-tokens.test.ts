import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_META, PLATFORMS, VIZ_SINGLE_SERIES } from "@/lib/platforms/registry";

const css = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");
const token = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1]?.toLowerCase();

describe("chart colors stay in sync with the validated CSS tokens", () => {
  it.each(PLATFORMS)("%s", (platform) => {
    expect(PLATFORM_META[platform].vizColor).toBe(token(`viz-${platform}`));
  });

  it("single-series gold", () => {
    expect(VIZ_SINGLE_SERIES).toBe(token("viz-gold"));
  });
});
