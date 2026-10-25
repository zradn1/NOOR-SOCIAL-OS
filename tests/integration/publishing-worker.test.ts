import { randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Platform } from "@/lib/platforms/registry";
import type { DB } from "@/server/db/schema.generated";
import { ProviderError } from "@/server/integrations/errors";
import { PROVIDERS } from "@/server/integrations/providers";
import type { ProviderRegistry } from "@/server/integrations/registry";
import { encryptSecret, parseKeyRing } from "@/server/integrations/token-crypto";
import type { PublishRequest, PublishResult, SocialProvider } from "@/server/integrations/types";
import { runPublishingBatch } from "@/server/publishing/worker";
import { asUser, createAuthUser, createOrganization, createTestDb, setPlan, type OrgFixture, type TestDb } from "../support/db";
import { kyselyFor } from "../support/services";

const ring = parseKeyRing(`k1:${randomBytes(32).toString("base64")}`, "k1");

type Behaviour = (req: PublishRequest) => Promise<PublishResult>;
let behaviour: Behaviour;
const published: PublishRequest[] = [];

// Test-only stand-in for an official integration.
const fake: SocialProvider = {
  ...PROVIDERS.linkedin,
  platform: "linkedin",
  capabilities: { publish: { text: true, image: true, video: true, carousel: true }, analytics: false, tokenRefresh: false, revoke: false, idempotentPublish: false },
  status: () => ({ platform: "linkedin", implemented: true, configured: true, missingConfig: [], summary: "fake" }),
  publish: (req) => {
    published.push(req);
    return behaviour(req);
  },
};
const registry: ProviderRegistry = { get: (p: Platform) => (p === "linkedin" ? fake : PROVIDERS[p]) };

let db: TestDb;
let k: Kysely<DB>;
let owner: string;
let org: OrgFixture;
let demoWs: string;
let liAccount: string;
let igAccount: string;
let manualAccount: string;
let demoAccount: string;

async function account(workspaceId: string, platform: string, status: string) {
  const prefix = status === "demo" ? "demo" : status === "manual" ? "manual" : "ext";
  const { rows } = await db.sys.query(
    `insert into social_accounts (workspace_id, organization_id, platform, display_name, external_account_id, connection_status, connected_at)
     values ($1, $2, $3::social_platform, $3::text, $4, $5::connection_status, case when $5::connection_status = 'connected' then now() end) returning id`,
    [workspaceId, org.organizationId, platform, `${prefix}_${platform}_${Math.random().toString(36).slice(2, 8)}`, status],
  );
  return rows[0].id as string;
}

/** Creates a post with one target and a job that is due now; returns job id. */
async function dueJob(workspaceId: string, accountId: string, caption = "Hello from NOOR") {
  return asUser(
    db,
    owner,
    async (c) => {
      const post = (await c.query("insert into content_posts (workspace_id, caption, created_by) values ($1, $2, $3) returning id", [workspaceId, caption, owner])).rows[0].id;
      await c.query("insert into post_platform_targets (workspace_id, post_id, social_account_id) values ($1, $2, $3)", [workspaceId, post, accountId]);
      await c.query("select app.schedule_post($1, now() + interval '5 minutes', 'UTC')", [post]);
      return post as string;
    },
    { commit: true },
  ).then(async (postId) => {
    const { rows } = await db.sys.query("update publishing_jobs set run_at = now() - interval '1 second' where post_id = $1 returning id", [postId]);
    return { jobId: rows[0].id as string, postId };
  });
}

async function state(jobId: string) {
  const { rows } = await db.sys.query(
    `select j.status, j.error_code, j.attempts, j.run_at > now() as delayed, t.status as target, t.external_post_id, p.status as post
       from publishing_jobs j join post_platform_targets t on t.id = j.target_id join content_posts p on p.id = j.post_id where j.id = $1`,
    [jobId],
  );
  return rows[0];
}

const run = () => runPublishingBatch({ workerId: "test-worker", db: k, registry, keyRing: () => ring, random: () => 0.5 });

beforeAll(async () => {
  db = await createTestDb();
  k = kyselyFor(db);
  owner = await createAuthUser(db.sys, "owner@worker.test");
  org = await createOrganization(db, owner, "Worker Co");
  await setPlan(db, org.organizationId, "pro");
  demoWs = await asUser(db, owner, async (c) => (await c.query("select * from app.create_workspace($1, 'Demo', 'internal', 'UTC', null, true)", [org.organizationId])).rows[0].workspace_id, { commit: true });
  liAccount = await account(org.workspaceId, "linkedin", "connected");
  igAccount = await account(org.workspaceId, "instagram", "connected");
  manualAccount = await account(org.workspaceId, "facebook", "manual");
  demoAccount = await account(demoWs, "linkedin", "demo");
  for (const id of [liAccount, igAccount]) {
    await db.sys.query(
      "insert into oauth_connections (social_account_id, workspace_id, provider, access_token_ciphertext, key_id, access_token_expires_at) values ($1, $2, (select platform from social_accounts where id = $1), $3, 'k1', now() + interval '1 hour')",
      [id, org.workspaceId, encryptSecret(ring, `token-for-${id}`, id)],
    );
  }
});

beforeEach(async () => {
  await db.sys.query("update publishing_jobs set status = 'cancelled' where status = 'pending'");
  published.length = 0;
  behaviour = async () => ({ outcome: "published", externalPostId: "urn:li:share:1", externalUrl: "https://www.linkedin.com/feed/update/1", publishedAt: new Date() });
});

afterAll(async () => {
  await k?.destroy();
  await db?.close();
});

describe("publishing worker", () => {
  it("marks a target published only with the provider's post id, and records usage", async () => {
    const { jobId } = await dueJob(org.workspaceId, liAccount);
    const summary = await run();
    expect(summary).toMatchObject({ claimed: 1, succeeded: 1 });
    expect(await state(jobId)).toMatchObject({ status: "succeeded", target: "published", external_post_id: "urn:li:share:1", post: "published" });
    expect(published[0]).toMatchObject({ accessToken: `token-for-${liAccount}`, text: "Hello from NOOR" });
    expect(published[0]!.idempotencyKey).toMatch(/^publish:/);
    const usage = await db.sys.query("select count(*)::int as n from usage_records where metric = 'post_published'");
    expect(usage.rows[0].n).toBe(1);
  });

  it("does not publish twice when the batch runs again", async () => {
    await dueJob(org.workspaceId, liAccount);
    await run();
    const again = await run();
    expect(again.claimed).toBe(0);
    expect(published).toHaveLength(1);
  });

  it("backs off and retries provider errors marked retryable", async () => {
    behaviour = async () => {
      throw new ProviderError("linkedin", "rate_limited", "Slow down", true, 429);
    };
    const { jobId } = await dueJob(org.workspaceId, liAccount);
    expect(await run()).toMatchObject({ retried: 1 });
    expect(await state(jobId)).toMatchObject({ status: "pending", error_code: "rate_limited", delayed: true, target: "scheduled", attempts: 1 });
  });

  it("fails permanently on a rejected request and notifies the workspace", async () => {
    behaviour = async () => {
      throw new ProviderError("linkedin", "invalid_request", "The platform rejected the post", false, 400);
    };
    const { jobId } = await dueJob(org.workspaceId, liAccount);
    expect(await run()).toMatchObject({ failed: 1 });
    expect(await state(jobId)).toMatchObject({ status: "failed", error_code: "invalid_request", target: "failed", post: "failed" });
    const n = await db.sys.query("select kind from notifications where user_id = $1 order by created_at desc limit 1", [owner]);
    expect(n.rows[0].kind).toBe("publishing.failed");
  });

  it("treats a lost response as an unknown outcome, never as success or a silent retry", async () => {
    behaviour = async () => {
      throw new Error("ECONNRESET");
    };
    const { jobId } = await dueJob(org.workspaceId, liAccount);
    await run();
    expect(await state(jobId)).toMatchObject({ status: "failed", error_code: "outcome_unknown", target: "failed" });
  });

  it("refuses a 'published' response that lacks a post id", async () => {
    behaviour = async () => ({ outcome: "published", externalPostId: "", publishedAt: new Date() });
    const { jobId } = await dueJob(org.workspaceId, liAccount);
    await run();
    expect(await state(jobId)).toMatchObject({ status: "failed", error_code: "unconfirmed", external_post_id: null });
  });

  it("blocks placeholder integrations without sending anything", async () => {
    const { jobId } = await dueJob(org.workspaceId, igAccount, "Instagram needs media, but the integration check comes first");
    await run();
    expect(await state(jobId)).toMatchObject({ status: "blocked", error_code: "integration_unavailable", target: "blocked" });
    expect(published).toHaveLength(0);
  });

  it("blocks manually tracked accounts", async () => {
    const { jobId } = await dueJob(org.workspaceId, manualAccount);
    await run();
    expect(await state(jobId)).toMatchObject({ status: "blocked", error_code: "account_not_connected" });
  });

  it("simulates demo jobs and never marks them published", async () => {
    const { jobId } = await dueJob(demoWs, demoAccount);
    expect(await run()).toMatchObject({ simulated: 1 });
    expect(await state(jobId)).toMatchObject({ status: "simulated", target: "simulated", external_post_id: null, post: "simulated" });
    expect(published).toHaveLength(0);
  });

  it("records a heartbeat for the admin health page", async () => {
    await run();
    const { rows } = await db.sys.query("select component from system_heartbeats");
    expect(rows.map((r) => r.component)).toContain("publishing-worker");
  });
});
