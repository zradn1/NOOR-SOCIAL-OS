import "server-only";
import { assertCan, type WorkspaceContext } from "@/server/auth/guard";
import { getDb, withSystem } from "@/server/db/client";
import { DEMO_BRAND } from "@/server/demo/content";
import { seedAccountAnalytics, seedDemoWorkspace } from "@/server/demo/seed";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import type { Platform } from "@/lib/platforms/registry";
import type { Tx } from "@/server/db/client";
import { logger } from "@/server/observability/logger";
import { createWorkspace } from "./workspaces";

type Meta = { ipHash?: string | null; userAgent?: string | null };

/** Creates the organization's demo workspace and fills it with synthetic data. */
export async function createDemoWorkspace(ctx: WorkspaceContext, meta: Meta = {}, db = getDb()) {
  assertCan(ctx, "demo.manage");
  if (!env().DEMO_MODE_ENABLED) throw new AppError("NOT_CONFIGURED", "Demo mode is disabled for this deployment.");
  const created = await createWorkspace(
    ctx,
    {
      name: `${DEMO_BRAND} (Demo)`,
      kind: "internal",
      timezone: ctx.workspace.timezone,
      description: "Simulated accounts, metrics, and posts for exploring NOOR. Nothing here is real.",
      isDemo: true,
    },
    meta,
    db,
  );
  try {
    await withSystem(
      (trx) =>
        seedDemoWorkspace(trx, {
          workspaceId: created.id,
          organizationId: ctx.organization.id,
          userId: ctx.user.id,
          now: new Date(),
        }),
      db,
    );
  } catch (error) {
    logger.error("demo.seed_failed", { workspaceId: created.id, error });
    await db.updateTable("workspaces").set({ deleted_at: new Date() }).where("id", "=", created.id).execute();
    throw new AppError("INTERNAL", "We couldn't prepare the demo workspace. Please try again.");
  }
  return created;
}

/** Seeder used when a single demo account is added to an existing demo workspace. */
export function demoAccountSeeder(workspaceId: string) {
  return (trx: Tx, accountId: string, platform: Platform) =>
    seedAccountAnalytics(trx, { workspaceId, accountId, platform, seed: `${workspaceId}:${accountId}`, today: new Date() });
}
