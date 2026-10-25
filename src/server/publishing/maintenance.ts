import "server-only";
import { sql, type Kysely } from "kysely";
import type { Platform } from "@/lib/platforms/registry";
import { getDb } from "@/server/db/client";
import type { DB } from "@/server/db/schema.generated";
import { IntegrationNotImplementedError } from "@/server/integrations/errors";
import { defaultRegistry, type ProviderRegistry } from "@/server/integrations/registry";
import { decryptSecret, encryptSecret, type KeyRing } from "@/server/integrations/token-crypto";
import { logger } from "@/server/observability/logger";
import { notifyWorkspaceAdmins } from "@/server/services/notifications";

const MAX_REFRESH_FAILURES = 3;

/*
 * Worker-side code must not import the request layer (src/server/auth,
 * next/navigation): it runs outside Next.js.
 */

/** Removes expired or used OAuth states. */
export async function pruneOAuthStates(db: Kysely<DB>) {
  const result = await db
    .deleteFrom("oauth_states")
    .where((eb) => eb.or([eb("expires_at", "<", sql<Date>`now() - interval '1 day'`), eb("consumed_at", "is not", null)]))
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

/**
 * Refreshes access tokens that expire within a day. After repeated failures
 * the account is marked expired and its admins are told to reconnect.
 */
export async function refreshExpiringTokens(deps: { db?: Kysely<DB>; registry?: ProviderRegistry; keyRing: () => KeyRing }) {
  const db = deps.db ?? getDb();
  const registry = deps.registry ?? defaultRegistry;
  const due = await db
    .selectFrom("oauth_connections as c")
    .innerJoin("social_accounts as a", "a.id", "c.social_account_id")
    .select(["c.id", "c.social_account_id", "c.workspace_id", "c.provider", "c.refresh_token_ciphertext", "c.refresh_failure_count", "a.organization_id", "a.display_name"])
    .where("c.revoked_at", "is", null)
    .where("c.refresh_token_ciphertext", "is not", null)
    .where("c.access_token_expires_at", "<", sql<Date>`now() + interval '1 day'`)
    .where("a.connection_status", "=", "connected")
    .limit(50)
    .execute();
  let refreshed = 0;
  for (const c of due) {
    const provider = registry.get(c.provider as Platform);
    if (!provider.capabilities.tokenRefresh || !provider.status().implemented) continue;
    try {
      const ring = deps.keyRing();
      const tokens = await provider.refreshToken({ refreshToken: decryptSecret(ring, c.refresh_token_ciphertext!, c.social_account_id) });
      await db
        .updateTable("oauth_connections")
        .set({
          access_token_ciphertext: encryptSecret(ring, tokens.accessToken, c.social_account_id),
          refresh_token_ciphertext: tokens.refreshToken ? encryptSecret(ring, tokens.refreshToken, c.social_account_id) : c.refresh_token_ciphertext,
          key_id: ring.activeKeyId,
          access_token_expires_at: tokens.accessTokenExpiresAt ?? null,
          last_refreshed_at: new Date(),
          refresh_failure_count: 0,
        })
        .where("id", "=", c.id)
        .execute();
      refreshed++;
    } catch (error) {
      if (error instanceof IntegrationNotImplementedError) continue;
      const failures = c.refresh_failure_count + 1;
      logger.warn("tokens.refresh_failed", { connectionId: c.id, failures, error });
      await db.updateTable("oauth_connections").set({ refresh_failure_count: failures }).where("id", "=", c.id).execute();
      if (failures >= MAX_REFRESH_FAILURES) {
        await db
          .updateTable("social_accounts")
          .set({ connection_status: "expired", last_error: "Access token couldn't be refreshed." })
          .where("id", "=", c.social_account_id)
          .execute();
        await notifyWorkspaceAdmins(db, c.workspace_id, {
          organizationId: c.organization_id,
          kind: "account.expired",
          severity: "warning",
          title: `Reconnect ${c.display_name}`,
          body: "Its access expired and couldn't be refreshed. Scheduled posts for it will be blocked until it's reconnected.",
        });
      }
    }
  }
  return refreshed;
}

/** Housekeeping that should run every few minutes alongside the queue. */
export async function runMaintenance(deps: { db?: Kysely<DB>; registry?: ProviderRegistry; keyRing: () => KeyRing }) {
  const db = deps.db ?? getDb();
  const [rate] = (await sql<{ n: number }>`select app.prune_rate_limits() as n`.execute(db)).rows;
  const states = await pruneOAuthStates(db);
  let tokens = 0;
  try {
    tokens = await refreshExpiringTokens(deps);
  } catch (error) {
    logger.error("maintenance.token_refresh_failed", { error });
  }
  return { prunedRateLimits: Number(rate?.n ?? 0), prunedOAuthStates: states, refreshedTokens: tokens };
}
