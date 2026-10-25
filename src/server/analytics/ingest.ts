import "server-only";
import { randomUUID } from "node:crypto";
import { METRICS } from "@/lib/platforms/metrics";
import type { Platform } from "@/lib/platforms/registry";
import type { ImportRow } from "@/lib/analytics/csv";
import type { Tx } from "@/server/db/client";

/**
 * Writes account-level metrics. Used by manual imports today and by provider
 * syncs once official integrations exist. Columns absent from a row are left
 * NULL (unavailable); re-importing a day replaces that day for the source.
 */
export async function ingestAccountMetrics(
  trx: Tx,
  input: {
    workspaceId: string;
    accountId: string;
    platform: Platform;
    source: "manual_import" | "provider_sync";
    rows: ImportRow[];
    capturedAt: Date;
  },
) {
  const batchId = randomUUID();
  const values = input.rows.map((r) => {
    const metrics: Record<string, number | null> = {};
    for (const m of METRICS) metrics[m] = r.values[m] ?? null;
    return {
      workspace_id: input.workspaceId,
      social_account_id: input.accountId,
      platform: input.platform,
      metric_date: r.metricDate,
      data_source: input.source,
      captured_at: input.capturedAt,
      import_batch_id: batchId,
      raw: JSON.stringify({ via: input.source }),
      ...metrics,
    };
  });
  for (let i = 0; i < values.length; i += 250) {
    const chunk = values.slice(i, i + 250);
    await trx
      .insertInto("analytics_snapshots")
      .values(chunk)
      .onConflict((oc) =>
        oc
          .columns(["social_account_id", "metric_date", "data_source"])
          .where("target_id", "is", null)
          .doUpdateSet((eb) => ({
            ...Object.fromEntries(METRICS.map((m) => [m, eb.ref(`excluded.${m}`)])),
            captured_at: eb.ref("excluded.captured_at"),
            import_batch_id: eb.ref("excluded.import_batch_id"),
          })),
      )
      .execute();
  }
  return { batchId, rows: values.length };
}
