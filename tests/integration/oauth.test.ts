import { createHash, randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Platform } from "@/lib/platforms/registry";
import type { DB } from "@/server/db/schema.generated";
import { PROVIDERS } from "@/server/integrations/providers";
import type { ProviderRegistry } from "@/server/integrations/registry";
import { decryptSecret, parseKeyRing } from "@/server/integrations/token-crypto";
import type { SocialProvider } from "@/server/integrations/types";
import { completeAuthorization, disconnectAccount, startAuthorization } from "@/server/services/social-accounts";
import {
  addMember,
  asUser,
  assignWorkspace,
  createAuthUser,
  createOrganization,
  createTestDb,
  setPlan,
  type OrgFixture,
  type TestDb,
} from "../support/db";
import { contextFor, kyselyFor } from "../support/services";

const ring = parseKeyRing(`k1:${randomBytes(32).toString("base64")}`, "k1");
const REDIRECT = "https://app.test/api/integrations/linkedin/callback";

/** Test-only provider standing in for a real official integration. */
function fakeProvider(platform: Platform): SocialProvider & { calls: { exchange: unknown[]; revoke: unknown[] } } {
  const calls = { exchange: [] as unknown[], revoke: [] as unknown[] };
  return {
    platform,
    calls,
    scopes: ["w_member_social"],
    docs: { developerPortal: "", authorizeEndpoint: "https://provider.test/authorize", tokenEndpoint: "", notes: "" },
    capabilities: {
      publish: { text: true, image: true, video: true, carousel: false },
      analytics: true,
      tokenRefresh: true,
      revoke: true,
      idempotentPublish: false,
    },
    status: () => ({ platform, implemented: true, configured: true, missingConfig: [], summary: "fake" }),
    buildAuthorizationUrl: ({ state, codeChallenge, redirectUri }) => {
      const url = new URL("https://provider.test/authorize");
      url.search = new URLSearchParams({ state, code_challenge: codeChallenge, code_challenge_method: "S256", redirect_uri: redirectUri }).toString();
      return url.toString();
    },
    exchangeCode: async (input) => {
      calls.exchange.push(input);
      return {
        accessToken: "access-token-plaintext",
        refreshToken: "refresh-token-plaintext",
        scopes: ["w_member_social"],
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      };
    },
    refreshToken: async () => {
      throw new Error("unused");
    },
    revokeToken: async (input) => {
      calls.revoke.push(input);
    },
    fetchAccount: async () => ({ externalAccountId: "li-123", displayName: "Studio Page", handle: "studio" }),
    publish: async () => {
      throw new Error("unused");
    },
    fetchMetrics: async () => [],
  };
}

let db: TestDb;
let k: Kysely<DB>;
let owner: string;
let viewer: string;
let org: OrgFixture;
let demoWs: string;
const fake = fakeProvider("linkedin");
const registry: ProviderRegistry = { get: (p) => (p === "linkedin" ? fake : PROVIDERS[p]) };

beforeAll(async () => {
  db = await createTestDb();
  k = kyselyFor(db);
  owner = await createAuthUser(db.sys, "owner@oauth.test");
  viewer = await createAuthUser(db.sys, "viewer@oauth.test");
  org = await createOrganization(db, owner, "OAuth Co");
  await setPlan(db, org.organizationId, "pro");
  await addMember(db, org.organizationId, viewer, "viewer");
  await assignWorkspace(db, org.workspaceId, org.organizationId, viewer, "viewer");
  demoWs = await asUser(
    db,
    owner,
    async (c) => (await c.query("select * from app.create_workspace($1, 'Demo', 'internal', 'UTC', null, true)", [org.organizationId])).rows[0]
      .workspace_id as string,
    { commit: true },
  );
});

afterAll(async () => {
  await k?.destroy();
  await db?.close();
});

async function start() {
  const ctx = await contextFor(db, owner, org.workspaceId);
  const url = new URL(await startAuthorization(ctx, "linkedin", { registry, ring, redirectUri: REDIRECT }, k));
  return { state: url.searchParams.get("state")!, challenge: url.searchParams.get("code_challenge")!, ctx };
}

describe("starting an authorization", () => {
  it("refuses platforms whose official integration isn't built", async () => {
    const ctx = await contextFor(db, owner, org.workspaceId);
    await expect(startAuthorization(ctx, "instagram", { registry, ring, redirectUri: REDIRECT }, k)).rejects.toMatchObject({
      code: "INTEGRATION_UNAVAILABLE",
    });
  });

  it("refuses demo workspaces and non-admins", async () => {
    await expect(startAuthorization(await contextFor(db, owner, demoWs), "linkedin", { registry, ring, redirectUri: REDIRECT }, k)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(startAuthorization(await contextFor(db, viewer, org.workspaceId), "linkedin", { registry, ring, redirectUri: REDIRECT }, k)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("stores only a hash of the state and an encrypted PKCE verifier", async () => {
    const { state } = await start();
    const { rows } = await db.sys.query("select state_hash, code_verifier_ciphertext from oauth_states order by created_at desc limit 1");
    expect(rows[0].state_hash).toBe(createHash("sha256").update(state).digest("hex"));
    expect(rows[0].state_hash).not.toContain(state);
    expect(rows[0].code_verifier_ciphertext.split(".")).toHaveLength(4);
  });
});

describe("completing an authorization", () => {
  it("connects the account, sends a verifier matching the challenge, and encrypts tokens", async () => {
    const { state, challenge } = await start();
    const user = { id: owner, email: "owner@oauth.test", sessionId: null };
    const outcome = await completeAuthorization(user, { platform: "linkedin", state, code: "auth-code" }, {}, { registry, ring, redirectUri: REDIRECT }, k);
    expect(outcome).toMatchObject({ ok: true });

    const exchange = fake.calls.exchange.at(-1) as { codeVerifier: string; code: string };
    expect(exchange.code).toBe("auth-code");
    expect(createHash("sha256").update(exchange.codeVerifier).digest("base64url")).toBe(challenge);

    const account = await db.sys.query("select id, connection_status, granted_scopes from social_accounts where external_account_id = 'li-123'");
    expect(account.rows[0]).toMatchObject({ connection_status: "connected", granted_scopes: ["w_member_social"] });
    const conn = await db.sys.query("select access_token_ciphertext, refresh_token_ciphertext, key_id from oauth_connections where social_account_id = $1", [
      account.rows[0].id,
    ]);
    const { access_token_ciphertext: ct } = conn.rows[0];
    expect(ct).not.toContain("access-token-plaintext");
    expect(decryptSecret(ring, ct, account.rows[0].id)).toBe("access-token-plaintext");
    // Bound to the account id: the same ciphertext can't be used for another account.
    expect(() => decryptSecret(ring, ct, "00000000-0000-0000-0000-000000000000")).toThrow();

    const audit = await db.sys.query("select action from audit_logs where target_id = $1", [account.rows[0].id]);
    expect(audit.rows.map((r) => r.action)).toContain("account.connected");
  });

  it("rejects a replayed state", async () => {
    const { state } = await start();
    const user = { id: owner, email: "owner@oauth.test", sessionId: null };
    await completeAuthorization(user, { platform: "linkedin", state, code: "c1" }, {}, { registry, ring, redirectUri: REDIRECT }, k);
    const replay = await completeAuthorization(user, { platform: "linkedin", state, code: "c2" }, {}, { registry, ring, redirectUri: REDIRECT }, k);
    expect(replay).toMatchObject({ ok: false, reason: "invalid_state" });
  });

  it("rejects expired states, other users, unknown states, and platform mismatches", async () => {
    const user = { id: owner, email: "owner@oauth.test", sessionId: null };
    const deps = { registry, ring, redirectUri: REDIRECT };

    const expired = await start();
    const later = () => new Date(Date.now() + 11 * 60_000);
    expect(await completeAuthorization(user, { platform: "linkedin", state: expired.state, code: "c" }, {}, { ...deps, now: later }, k)).toMatchObject({
      ok: false,
      reason: "expired_state",
    });

    const stolen = await start();
    expect(
      await completeAuthorization({ id: viewer, email: null, sessionId: null }, { platform: "linkedin", state: stolen.state, code: "c" }, {}, deps, k),
    ).toMatchObject({ ok: false, reason: "wrong_user" });

    expect(await completeAuthorization(user, { platform: "linkedin", state: "forged-state", code: "c" }, {}, deps, k)).toMatchObject({
      ok: false,
      reason: "invalid_state",
    });

    const mismatch = await start();
    expect(await completeAuthorization(user, { platform: "x", state: mismatch.state, code: "c" }, {}, deps, k)).toMatchObject({
      ok: false,
      reason: "invalid_state",
    });
  });
});

describe("disconnecting", () => {
  it("revokes at the provider, erases ciphertexts, and blocks queued posts", async () => {
    const { rows } = await db.sys.query("select id from social_accounts where external_account_id = 'li-123'");
    const accountId = rows[0].id as string;
    // Queue a post for the account.
    const post = await asUser(
      db,
      owner,
      async (c) => {
        const p = (await c.query("insert into content_posts (workspace_id, caption, created_by) values ($1, 'hi', $2) returning id", [org.workspaceId, owner]))
          .rows[0].id;
        await c.query("insert into post_platform_targets (workspace_id, post_id, social_account_id) values ($1, $2, $3)", [org.workspaceId, p, accountId]);
        await c.query("select app.schedule_post($1, now() + interval '2 hours', 'UTC')", [p]);
        return p as string;
      },
      { commit: true },
    );

    const revokeSpy = vi.spyOn(fake, "revokeToken");
    const ctx = await contextFor(db, owner, org.workspaceId);
    const result = await disconnectAccount(ctx, accountId, {}, { registry, ring }, k);
    expect(result.revokedAtProvider).toBe(true);
    expect(revokeSpy).toHaveBeenCalledWith({ accessToken: "access-token-plaintext", refreshToken: "refresh-token-plaintext" });

    const conn = await db.sys.query("select access_token_ciphertext, refresh_token_ciphertext, revoked_at from oauth_connections where social_account_id = $1", [accountId]);
    expect(conn.rows[0]).toMatchObject({ access_token_ciphertext: null, refresh_token_ciphertext: null });
    expect(conn.rows[0].revoked_at).not.toBeNull();
    const acct = await db.sys.query("select connection_status from social_accounts where id = $1", [accountId]);
    expect(acct.rows[0].connection_status).toBe("disconnected");
    const job = await db.sys.query("select status, error_code from publishing_jobs where post_id = $1", [post]);
    expect(job.rows[0]).toEqual({ status: "blocked", error_code: "account_disconnected" });
  });

  it("is forbidden for viewers", async () => {
    const ctx = await contextFor(db, viewer, org.workspaceId);
    await expect(disconnectAccount(ctx, "00000000-0000-0000-0000-000000000000", {}, { registry, ring }, k)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
