import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { PLATFORM_META, type Platform } from "@/lib/platforms/registry";
import { assertCan, type WorkspaceContext } from "@/server/auth/context";
import type { SessionUser } from "@/server/auth/session";
import { getDb, withSystem, withUser, type Executor, type Tx } from "@/server/db/client";
import { env } from "@/server/env";
import { AppError, notFound } from "@/server/errors";
import { IntegrationNotImplementedError } from "@/server/integrations/errors";
import { codeChallengeS256, randomToken, sha256Hex } from "@/server/integrations/pkce";
import { canConnect, defaultRegistry, type ProviderRegistry } from "@/server/integrations/registry";
import { decryptSecret, encryptSecret, parseKeyRing, type KeyRing } from "@/server/integrations/token-crypto";
import { logger } from "@/server/observability/logger";
import { recordAudit } from "./audit";
import { notifyWorkspaceAdmins } from "./notifications";
import { assertWithinLimit } from "./plan-limits";

type Meta = { ipHash?: string | null; userAgent?: string | null };

export type SocialAccountView = {
  id: string;
  platform: Platform;
  displayName: string;
  handle: string | null;
  externalAccountId: string;
  status: "demo" | "manual" | "pending" | "connected" | "expired" | "revoked" | "error" | "disconnected";
  isDemo: boolean;
  scopes: string[];
  lastSyncedAt: string | null;
  lastError: string | null;
  connectedAt: string | null;
  createdAt: string;
  latestMetricDate: string | null;
};

export async function listSocialAccounts(ctx: WorkspaceContext, db = getDb()): Promise<SocialAccountView[]> {
  const rows = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("social_accounts as a")
        .select([
          "a.id",
          "a.platform",
          "a.display_name",
          "a.handle",
          "a.external_account_id",
          "a.connection_status",
          "a.is_demo",
          "a.granted_scopes",
          "a.last_synced_at",
          "a.last_error",
          "a.connected_at",
          "a.created_at",
          (eb) =>
            eb
              .selectFrom("analytics_snapshots as s")
              .select((e) => e.fn.max("s.metric_date").as("d"))
              .whereRef("s.social_account_id", "=", "a.id")
              .where("s.target_id", "is", null)
              .as("latest_metric_date"),
        ])
        .where("a.workspace_id", "=", ctx.workspace.id)
        .orderBy(sql`array_position(array['instagram','tiktok','facebook','youtube','linkedin','x','pinterest']::social_platform[], a.platform)`)
        .orderBy("a.created_at")
        .execute(),
    db,
  );
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    displayName: r.display_name,
    handle: r.handle,
    externalAccountId: r.external_account_id,
    status: r.connection_status,
    isDemo: r.is_demo,
    scopes: r.granted_scopes,
    lastSyncedAt: r.last_synced_at?.toISOString() ?? null,
    lastError: r.last_error,
    connectedAt: r.connected_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    latestMetricDate: r.latest_metric_date ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Demo and manually tracked accounts
// ---------------------------------------------------------------------------

/** Adds a simulated account. Only possible inside a demo workspace. */
export async function addDemoAccount(
  ctx: WorkspaceContext,
  platform: Platform,
  seed: (trx: Tx, accountId: string, platform: Platform) => Promise<void>,
  meta: Meta = {},
  db = getDb(),
) {
  assertCan(ctx, "accounts.connect");
  if (!ctx.workspace.isDemo) {
    throw new AppError("VALIDATION", "Demo accounts can only be added to a demo workspace.");
  }
  const id = await withSystem(async (trx) => {
    const existing = await trx
      .selectFrom("social_accounts")
      .select("id")
      .where("workspace_id", "=", ctx.workspace.id)
      .where("platform", "=", platform)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (existing) throw new AppError("CONFLICT", `This demo workspace already has a ${PLATFORM_META[platform].name} account.`);
    const row = await trx
      .insertInto("social_accounts")
      .values({
        workspace_id: ctx.workspace.id,
        organization_id: ctx.organization.id,
        platform,
        display_name: `${PLATFORM_META[platform].name} · Demo`,
        handle: `noor.demo.${platform}`,
        external_account_id: `demo_${platform}_${randomUUID().slice(0, 8)}`,
        connection_status: "demo",
        connected_by: ctx.user.id,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await seed(trx, row.id, platform);
    return row.id;
  }, db);
  await recordAudit(
    {
      action: "account.demo_added",
      organizationId: ctx.organization.id,
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      targetType: "social_account",
      targetId: id,
      metadata: { platform },
      isDemo: true,
      ...meta,
    },
    db,
  );
  return id;
}

/**
 * Adds an account tracked by hand (for imported analytics). It is explicitly
 * NOT connected: it holds no credentials and cannot publish.
 */
export async function addManualAccount(
  ctx: WorkspaceContext,
  input: { platform: Platform; displayName: string; handle?: string | null },
  meta: Meta = {},
  db = getDb(),
) {
  assertCan(ctx, "accounts.connect");
  if (ctx.workspace.isDemo) throw new AppError("VALIDATION", "Use demo accounts inside a demo workspace.");
  const id = await withSystem(async (trx) => {
    await assertWithinLimit(trx, ctx.organization.id, "social_accounts");
    const row = await trx
      .insertInto("social_accounts")
      .values({
        workspace_id: ctx.workspace.id,
        organization_id: ctx.organization.id,
        platform: input.platform,
        display_name: input.displayName,
        handle: input.handle?.replace(/^@/, "") || null,
        external_account_id: `manual_${randomUUID()}`,
        connection_status: "manual",
        connected_by: ctx.user.id,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }, db);
  await recordAudit(
    {
      action: "account.manual_added",
      organizationId: ctx.organization.id,
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      targetType: "social_account",
      targetId: id,
      metadata: { platform: input.platform },
      ...meta,
    },
    db,
  );
  return id;
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

export type DisconnectResult = { revokedAtProvider: boolean; revocationNote: string | null };

/**
 * Disconnects an account: revokes the token at the provider when supported,
 * erases stored ciphertexts, blocks queued posts for the account, and records
 * an audit entry. Demo and manual accounts are removed instead.
 */
export async function disconnectAccount(
  ctx: WorkspaceContext,
  accountId: string,
  meta: Meta = {},
  deps: { registry?: ProviderRegistry; ring?: KeyRing } = {},
  db = getDb(),
): Promise<DisconnectResult> {
  assertCan(ctx, "accounts.disconnect");
  const registry = deps.registry ?? defaultRegistry;
  const visible = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .selectFrom("social_accounts")
        .select(["id", "platform", "connection_status", "is_demo"])
        .where("id", "=", accountId)
        .where("workspace_id", "=", ctx.workspace.id)
        .executeTakeFirst(),
    db,
  );
  if (!visible) throw notFound("That account no longer exists.");

  let result: DisconnectResult = { revokedAtProvider: false, revocationNote: null };
  const connection = await db
    .selectFrom("oauth_connections")
    .selectAll()
    .where("social_account_id", "=", accountId)
    .where("revoked_at", "is", null)
    .executeTakeFirst();

  if (connection) {
    const provider = registry.get(visible.platform);
    if (provider.capabilities.revoke && provider.status().implemented) {
      try {
        const ring = deps.ring ?? keyRing();
        await provider.revokeToken({
          accessToken: connection.access_token_ciphertext ? decryptSecret(ring, connection.access_token_ciphertext, accountId) : null,
          refreshToken: connection.refresh_token_ciphertext ? decryptSecret(ring, connection.refresh_token_ciphertext, accountId) : null,
        });
        result = { revokedAtProvider: true, revocationNote: null };
      } catch (error) {
        logger.warn("account.revoke_failed", { platform: visible.platform, error });
        result = {
          revokedAtProvider: false,
          revocationNote: `${PLATFORM_META[visible.platform].name} didn't confirm revocation. Remove NOOR's access in the platform's settings to be certain.`,
        };
      }
    } else {
      result = {
        revokedAtProvider: false,
        revocationNote: `${PLATFORM_META[visible.platform].name} doesn't offer token revocation through its API. Remove NOOR's access in the platform's settings.`,
      };
    }
  }

  await withSystem(async (trx) => {
    await trx
      .updateTable("oauth_connections")
      .set({ access_token_ciphertext: null, refresh_token_ciphertext: null, revoked_at: new Date() })
      .where("social_account_id", "=", accountId)
      .where("revoked_at", "is", null)
      .execute();

    const removeOnly = visible.is_demo || visible.connection_status === "manual";
    await trx
      .updateTable("social_accounts")
      .set(
        removeOnly
          ? { deleted_at: new Date() }
          : { connection_status: "disconnected", disconnected_at: new Date(), granted_scopes: [] },
      )
      .where("id", "=", accountId)
      .execute();

    // Anything queued for this account can no longer be published.
    const blocked = await trx
      .updateTable("publishing_jobs")
      .set({ status: "blocked", error_code: "account_disconnected", last_error: "The account was disconnected.", completed_at: new Date() })
      .where("status", "=", "pending")
      .where("target_id", "in", (eb) => eb.selectFrom("post_platform_targets").select("id").where("social_account_id", "=", accountId))
      .returning(["target_id", "post_id"])
      .execute();
    for (const job of blocked) {
      await trx
        .updateTable("post_platform_targets")
        .set({ status: "blocked", last_error: "The account was disconnected." })
        .where("id", "=", job.target_id)
        .execute();
      await sql`select app.refresh_post_status(${job.post_id}::uuid)`.execute(trx);
    }
    if (blocked.length) {
      await notifyWorkspaceAdmins(trx, ctx.workspace.id, {
        organizationId: ctx.organization.id,
        kind: "publishing.blocked",
        severity: "warning",
        title: `${blocked.length} scheduled post${blocked.length > 1 ? "s" : ""} blocked`,
        body: `${PLATFORM_META[visible.platform].name} was disconnected, so queued posts for it can't be published.`,
        link: `/w/${ctx.workspace.slug}/publishing`,
      });
    }
  }, db);

  await recordAudit(
    {
      action: visible.is_demo || visible.connection_status === "manual" ? "account.removed" : "account.disconnected",
      organizationId: ctx.organization.id,
      workspaceId: ctx.workspace.id,
      actorId: ctx.user.id,
      targetType: "social_account",
      targetId: accountId,
      metadata: { platform: visible.platform, revokedAtProvider: result.revokedAtProvider },
      isDemo: visible.is_demo,
      ...meta,
    },
    db,
  );
  return result;
}

// ---------------------------------------------------------------------------
// OAuth 2.0 + PKCE
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 10 * 60 * 1000;

export function keyRing(): KeyRing {
  return parseKeyRing(env().TOKEN_ENCRYPTION_KEYS, env().TOKEN_ENCRYPTION_ACTIVE_KEY_ID);
}

export function callbackUrl(platform: Platform) {
  return `${env().NEXT_PUBLIC_APP_URL}/api/integrations/${platform}/callback`;
}

/** Starts an authorization: returns the provider URL to redirect the browser to. */
export async function startAuthorization(
  ctx: WorkspaceContext,
  platform: Platform,
  deps: { registry?: ProviderRegistry; ring?: KeyRing; now?: () => Date; redirectUri?: string } = {},
  db = getDb(),
) {
  assertCan(ctx, "accounts.connect");
  if (ctx.workspace.isDemo) {
    throw new AppError("VALIDATION", "Demo workspaces can't connect real accounts. Use a regular workspace.");
  }
  const provider = (deps.registry ?? defaultRegistry).get(platform);
  const status = provider.status();
  if (!canConnect(status)) {
    throw new AppError("INTEGRATION_UNAVAILABLE", status.summary, { platform, missing: status.missingConfig });
  }
  const ring = deps.ring ?? keyRing();
  const now = deps.now?.() ?? new Date();
  const state = randomToken();
  const verifier = randomToken();
  const stateHash = sha256Hex(state);

  await withSystem(async (trx) => {
    await assertWithinLimit(trx, ctx.organization.id, "social_accounts");
    await trx
      .insertInto("oauth_states")
      .values({
        state_hash: stateHash,
        user_id: ctx.user.id,
        workspace_id: ctx.workspace.id,
        platform,
        // The verifier is bound to its state so it can't be replayed elsewhere.
        code_verifier_ciphertext: encryptSecret(ring, verifier, stateHash),
        redirect_path: `/w/${ctx.workspace.slug}/accounts`,
        expires_at: new Date(now.getTime() + STATE_TTL_MS),
      })
      .execute();
  }, db);

  return provider.buildAuthorizationUrl({
    state,
    codeChallenge: codeChallengeS256(verifier),
    redirectUri: deps.redirectUri ?? callbackUrl(platform),
  });
}

export type CallbackOutcome =
  | { ok: true; redirectPath: string; accountId: string }
  | { ok: false; reason: "invalid_state" | "expired_state" | "wrong_user" | "provider_error" | "not_implemented"; redirectPath: string };

/**
 * Completes an authorization. The state must exist, match the platform, be
 * unexpired and unused, and belong to the signed-in user; it is consumed in
 * the same transaction so a replayed callback fails. Tokens are encrypted
 * before they touch the database.
 */
export async function completeAuthorization(
  user: SessionUser,
  input: { platform: Platform; state: string; code: string },
  meta: Meta = {},
  deps: { registry?: ProviderRegistry; ring?: KeyRing; now?: () => Date; redirectUri?: string } = {},
  db = getDb(),
): Promise<CallbackOutcome> {
  const ring = deps.ring ?? keyRing();
  const now = deps.now?.() ?? new Date();
  const stateHash = sha256Hex(input.state);

  const claimed = await withSystem(async (trx) => {
    const row = await trx
      .selectFrom("oauth_states")
      .selectAll()
      .where("state_hash", "=", stateHash)
      .where("platform", "=", input.platform)
      .forUpdate()
      .executeTakeFirst();
    if (!row || row.consumed_at) return { error: "invalid_state" as const };
    await trx.updateTable("oauth_states").set({ consumed_at: now }).where("id", "=", row.id).execute();
    if (row.expires_at <= now) return { error: "expired_state" as const, row };
    if (row.user_id !== user.id) return { error: "wrong_user" as const, row };
    return { row };
  }, db);

  const fallbackPath = "/app";
  if ("error" in claimed && claimed.error) {
    logger.warn("oauth.callback_rejected", { platform: input.platform, reason: claimed.error });
    return { ok: false, reason: claimed.error, redirectPath: claimed.row?.redirect_path ?? fallbackPath };
  }
  const state = claimed.row;
  const provider = (deps.registry ?? defaultRegistry).get(input.platform);

  try {
    const verifier = decryptSecret(ring, state.code_verifier_ciphertext, stateHash);
    const tokens = await provider.exchangeCode({
      code: input.code,
      codeVerifier: verifier,
      redirectUri: deps.redirectUri ?? callbackUrl(input.platform),
    });
    const account = await provider.fetchAccount({ accessToken: tokens.accessToken });

    const workspace = await db
      .selectFrom("workspaces")
      .select(["id", "organization_id", "is_demo", "slug"])
      .where("id", "=", state.workspace_id)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!workspace || workspace.is_demo) return { ok: false, reason: "invalid_state", redirectPath: state.redirect_path };

    const accountId = await withSystem(async (trx) => {
      const existing = await trx
        .selectFrom("social_accounts")
        .select("id")
        .where("workspace_id", "=", workspace.id)
        .where("platform", "=", input.platform)
        .where("external_account_id", "=", account.externalAccountId)
        .where("deleted_at", "is", null)
        .executeTakeFirst();
      if (!existing) await assertWithinLimit(trx, workspace.organization_id, "social_accounts");
      const values = {
        display_name: account.displayName.slice(0, 120),
        handle: account.handle ?? null,
        connection_status: "connected" as const,
        granted_scopes: tokens.scopes,
        connected_by: user.id,
        connected_at: now,
        disconnected_at: null,
        last_error: null,
      };
      const id = existing
        ? (await trx.updateTable("social_accounts").set(values).where("id", "=", existing.id).returning("id").executeTakeFirstOrThrow()).id
        : (
            await trx
              .insertInto("social_accounts")
              .values({
                ...values,
                workspace_id: workspace.id,
                organization_id: workspace.organization_id,
                platform: input.platform,
                external_account_id: account.externalAccountId,
              })
              .returning("id")
              .executeTakeFirstOrThrow()
          ).id;
      const encrypted = {
        access_token_ciphertext: encryptSecret(ring, tokens.accessToken, id),
        refresh_token_ciphertext: tokens.refreshToken ? encryptSecret(ring, tokens.refreshToken, id) : null,
        key_id: ring.activeKeyId,
        token_type: tokens.tokenType ?? null,
        scopes: tokens.scopes,
        access_token_expires_at: tokens.accessTokenExpiresAt ?? null,
        refresh_token_expires_at: tokens.refreshTokenExpiresAt ?? null,
        provider_user_id: account.externalAccountId,
        revoked_at: null,
        refresh_failure_count: 0,
      };
      await trx
        .insertInto("oauth_connections")
        .values({ ...encrypted, social_account_id: id, workspace_id: workspace.id, provider: input.platform })
        .onConflict((oc) => oc.column("social_account_id").doUpdateSet(encrypted))
        .execute();
      return id;
    }, db);

    await recordAudit(
      {
        action: "account.connected",
        organizationId: workspace.organization_id,
        workspaceId: workspace.id,
        actorId: user.id,
        targetType: "social_account",
        targetId: accountId,
        metadata: { platform: input.platform, scopes: tokens.scopes },
        ...meta,
      },
      db,
    );
    return { ok: true, redirectPath: state.redirect_path, accountId };
  } catch (error) {
    const reason = error instanceof IntegrationNotImplementedError ? "not_implemented" : "provider_error";
    logger.warn("oauth.callback_failed", { platform: input.platform, reason, error });
    return { ok: false, reason, redirectPath: state.redirect_path };
  }
}

/** Removes expired, unused OAuth states (called by the worker). */
export async function pruneOAuthStates(executor: Executor = getDb()) {
  const result = await executor
    .deleteFrom("oauth_states")
    .where((eb) => eb.or([eb("expires_at", "<", sql<Date>`now() - interval '1 day'`), eb("consumed_at", "is not", null)]))
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}
