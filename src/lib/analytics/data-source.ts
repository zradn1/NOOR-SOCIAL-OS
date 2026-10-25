/**
 * Where a number came from. Every metric shown in the product carries one of
 * these so demo, imported, and platform-verified data can never be confused.
 */
export const DATA_SOURCES = ["demo", "manual_import", "provider_sync"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export type MetricProvenance = DataSource | "unavailable" | "mixed";

export const DATA_SOURCE_META: Record<
  MetricProvenance,
  { label: string; tone: "demo" | "info" | "success" | "neutral" | "warning"; description: string }
> = {
  demo: {
    label: "Demo data",
    tone: "demo",
    description:
      "Synthetic numbers generated for this demo workspace. They do not come from any social platform.",
  },
  manual_import: {
    label: "Imported",
    tone: "info",
    description:
      "Imported from a file a team member uploaded. These numbers are not verified by the platform.",
  },
  provider_sync: {
    label: "Platform API",
    tone: "success",
    description: "Fetched from the platform's official API through a verified connection.",
  },
  unavailable: {
    label: "Unavailable",
    tone: "neutral",
    description: "No data source currently provides this metric for the selected accounts.",
  },
  mixed: {
    label: "Mixed sources",
    tone: "warning",
    description: "Combines imported and platform-synced data. Open the breakdown to see each source.",
  },
};

export type Freshness = "fresh" | "stale" | "outdated" | "never";

/** fresh < 24h, stale < 72h, outdated beyond that. */
export function freshnessOf(capturedAt: Date | string | null | undefined, now: Date): Freshness {
  if (!capturedAt) return "never";
  const t = typeof capturedAt === "string" ? new Date(capturedAt) : capturedAt;
  const hours = (now.getTime() - t.getTime()) / 3_600_000;
  if (hours < 24) return "fresh";
  if (hours < 72) return "stale";
  return "outdated";
}
