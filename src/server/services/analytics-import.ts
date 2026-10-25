import "server-only";
import { sql } from "kysely";
import { parseMetricsImport } from "@/lib/analytics/csv";
import { todayIn } from "@/lib/time/zoned";
import { ingestAccountMetrics } from "@/server/analytics/ingest";
import { assertCan, type WorkspaceContext } from "@/server/auth/guard";
import { getDb, withSystem, withUser } from "@/server/db/client";
import { AppError, notFound } from "@/server/errors";
import { recordAudit } from "./audit";

type Meta = { ipHash?: string | null; userAgent?: string | null };

export async function canImportAnalytics(ctx: WorkspaceContext, db = getDb()) {
  const { rows } = await sql<{ ok: boolean }>`select app.plan_has_feature(${ctx.organization.id}::uuid, 'analytics_import') as ok`.execute(db);
  return Boolean(rows[0]?.ok);
}

/**
 * Imports a CSV export into a manually tracked account. Role, plan feature,
 * account eligibility, and every row are checked on the server.
 */
export async function importAccountMetrics(
  ctx: WorkspaceContext,
  input: { accountId: string; csv: string },
  meta: Meta = {},
  db = getDb(),
) {
  assertCan(ctx, "analytics.import");
  if (ctx.workspace.isDemo) throw new AppError("VALIDATION", "Demo workspaces only hold simulated data. Import into a regular workspace.");
  if (!(await canImportAnalytics(ctx, db))) {
    throw new AppError("PLAN_FEATURE", "Analytics import isn't included in your plan.", { feature: "analytics_import" });
  }
  if (input.csv.length > 1_000_000) throw new AppError("VALIDATION", "That file is larger than 1 MB.");

  const account = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("social_accounts")
        .select(["id", "platform", "connection_status", "display_name"])
        .where("id", "=", input.accountId)
        .where("workspace_id", "=", ctx.workspace.id)
        .executeTakeFirst(),
    db,
  );
  if (!account) throw notFound("That account no longer exists.");
  if (account.connection_status !== "manual") {
    throw new AppError("VALIDATION", "Imports go into manually tracked accounts. Connected accounts are synced from the platform.");
  }

  const now = new Date();
  const parsed = parseMetricsImport(input.csv, account.platform, todayIn(ctx.workspace.timezone, now));
  if (parsed.errors.length) {
    throw new AppError("VALIDATION", `The file has ${parsed.errors.length} problem${parsed.errors.length > 1 ? "s" : ""}.`, {
      errors: parsed.errors,
    });
  }

  const result = await withSystem(async (trx) => {
    const ingested = await ingestAccountMetrics(trx, {
      workspaceId: ctx.workspace.id,
      accountId: account.id,
      platform: account.platform,
      source: "manual_import",
      rows: parsed.rows,
      capturedAt: now,
    });
    await trx
      .insertInto("usage_records")
      .values({
        organization_id: ctx.organization.id,
        workspace_id: ctx.workspace.id,
        user_id: ctx.user.id,
        metric: "analytics_import",
        quantity: ingested.rows,
        metadata: JSON.stringify({ account_id: account.id, batch_id: ingested.batchId }),
      })
      .execute();
    return ingested;
  }, db);

  await recordAudit(
    {
      action: "analytics.imported",
      organizationId: ctx.organization.id,
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      targetType: "social_account",
      targetId: account.id,
      metadata: { rows: result.rows, columns: parsed.columns, batch: result.batchId },
      ...meta,
    },
    db,
  );
  return { rows: result.rows, columns: parsed.columns, warnings: parsed.warnings };
}
