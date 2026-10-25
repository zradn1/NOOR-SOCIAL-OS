import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addMember,
  asUser,
  assignWorkspace,
  createAuthUser,
  createOrganization,
  createTestDb,
  pgError,
  setPlan,
  type OrgFixture,
  type TestDb,
} from "../support/db";

let db: TestDb;
let owner: string;
let editor: string;
let viewer: string;
let outsider: string;
let org: OrgFixture;
let otherOrg: OrgFixture;
let demoWs: string;
let igAccount: string;
let liAccount: string;
let demoAccount: string;
let otherAccount: string;

async function insertAccount(
  workspaceId: string,
  organizationId: string,
  platform: string,
  status: string,
  externalId = `${status === "demo" ? "demo" : status === "manual" ? "manual" : "ext"}_${randomUUID().slice(0, 8)}`,
) {
  const { rows } = await db.sys.query(
    `insert into social_accounts (workspace_id, organization_id, platform, display_name, external_account_id, connection_status, connected_at)
     values ($1, $2, $3, $4, $5, $6::connection_status, case when $6::connection_status = 'connected' then now() end) returning id`,
    [workspaceId, organizationId, platform, `${platform} account`, externalId, status],
  );
  return rows[0].id as string;
}

async function createPost(userId: string, workspaceId: string, caption = "Hello") {
  return asUser(
    db,
    userId,
    async (c) => {
      const { rows } = await c.query(
        "insert into content_posts (workspace_id, caption, created_by, updated_by) values ($1, $2, $3, $3) returning id",
        [workspaceId, caption, userId],
      );
      return rows[0].id as string;
    },
    { commit: true },
  );
}

async function addTarget(userId: string, workspaceId: string, postId: string, accountId: string) {
  return asUser(
    db,
    userId,
    async (c) => {
      const { rows } = await c.query(
        "insert into post_platform_targets (workspace_id, post_id, social_account_id) values ($1, $2, $3) returning id, platform",
        [workspaceId, postId, accountId],
      );
      return rows[0] as { id: string; platform: string };
    },
    { commit: true },
  );
}

const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString();

beforeAll(async () => {
  db = await createTestDb();
  owner = await createAuthUser(db.sys, "owner@studio.test");
  editor = await createAuthUser(db.sys, "editor@studio.test");
  viewer = await createAuthUser(db.sys, "viewer@studio.test");
  outsider = await createAuthUser(db.sys, "outsider@else.test");
  org = await createOrganization(db, owner, "Studio");
  otherOrg = await createOrganization(db, outsider, "Elsewhere");
  // Pro: unlimited scheduling, so this suite isn't capped by the free plan.
  await setPlan(db, org.organizationId, "pro");
  await addMember(db, org.organizationId, editor, "editor");
  await addMember(db, org.organizationId, viewer, "viewer");
  await assignWorkspace(db, org.workspaceId, org.organizationId, editor, "editor");
  await assignWorkspace(db, org.workspaceId, org.organizationId, viewer, "viewer");
  demoWs = await asUser(
    db,
    owner,
    async (c) => {
      const { rows } = await c.query("select * from app.create_workspace($1, 'Demo', 'internal', 'UTC', null, true)", [
        org.organizationId,
      ]);
      return rows[0].workspace_id as string;
    },
    { commit: true },
  );
  igAccount = await insertAccount(org.workspaceId, org.organizationId, "instagram", "connected");
  liAccount = await insertAccount(org.workspaceId, org.organizationId, "linkedin", "connected");
  demoAccount = await insertAccount(demoWs, org.organizationId, "tiktok", "demo");
  otherAccount = await insertAccount(otherOrg.workspaceId, otherOrg.organizationId, "x", "connected");
});

afterAll(async () => {
  await db?.close();
});

describe("demo isolation", () => {
  it("copies is_demo from the workspace and keeps it immutable", async () => {
    const { rows } = await db.sys.query("select is_demo from social_accounts where id = $1", [demoAccount]);
    expect(rows[0].is_demo).toBe(true);
    const err = await pgError(db.sys.query("update social_accounts set is_demo = false where id = $1", [demoAccount]));
    expect(err.message).toMatch(/immutable/);
  });

  it("allows the demo connection status only inside demo workspaces", async () => {
    const realAsDemo = await pgError(insertAccount(org.workspaceId, org.organizationId, "youtube", "demo"));
    expect(realAsDemo.message).toMatch(/social_accounts_demo_status/);
    const demoAsConnected = await pgError(insertAccount(demoWs, org.organizationId, "youtube", "connected", "demo_yt"));
    expect(demoAsConnected.message).toMatch(/social_accounts_demo_status/);
  });

  it("refuses to store platform credentials for a demo workspace", async () => {
    const err = await pgError(
      db.sys.query(
        "insert into oauth_connections (social_account_id, workspace_id, provider, key_id) values ($1, $2, 'tiktok', 'v1')",
        [demoAccount, demoWs],
      ),
    );
    expect(err.message).toMatch(/demo workspaces cannot store platform credentials/);
  });

  it("keeps demo analytics in demo workspaces and real analytics out of them", async () => {
    const demoInReal = await pgError(
      db.sys.query(
        "insert into analytics_snapshots (workspace_id, social_account_id, platform, metric_date, data_source, followers) values ($1, $2, 'instagram', current_date, 'demo', 10)",
        [org.workspaceId, igAccount],
      ),
    );
    expect(demoInReal.message).toMatch(/analytics_demo_source/);
    const importInDemo = await pgError(
      db.sys.query(
        "insert into analytics_snapshots (workspace_id, social_account_id, platform, metric_date, data_source, followers) values ($1, $2, 'tiktok', current_date, 'manual_import', 10)",
        [demoWs, demoAccount],
      ),
    );
    expect(importInDemo.message).toMatch(/analytics_demo_source/);
  });

  it("never lets a demo target be marked published", async () => {
    const post = await createPost(owner, demoWs);
    const target = await addTarget(owner, demoWs, post, demoAccount);
    const err = await pgError(
      db.sys.query(
        "update post_platform_targets set status = 'published', external_post_id = 'x', published_at = now() where id = $1",
        [target.id],
      ),
    );
    expect(err.message).toMatch(/targets_demo_never_published/);
  });
});

describe("social accounts and tokens", () => {
  it("are readable in the workspace but never writable through the API", async () => {
    await asUser(db, viewer, async (c) => {
      const { rows } = await c.query("select id from social_accounts order by platform");
      expect(rows.map((r) => r.id).sort()).toEqual([igAccount, liAccount].sort());
    });
    const err = await pgError(
      asUser(db, owner, (c) => c.query("update social_accounts set connection_status = 'connected' where id = $1", [demoAccount])),
    );
    expect(err.code).toBe("42501");
  });

  it("keeps OAuth tokens and states completely hidden from API roles", async () => {
    for (const table of ["oauth_connections", "oauth_states"]) {
      const err = await pgError(asUser(db, owner, (c) => c.query(`select * from ${table}`)));
      expect(err.code, table).toBe("42501");
    }
  });

  it("does not show another tenant's accounts", async () => {
    await asUser(db, outsider, async (c) => {
      const { rows } = await c.query("select id from social_accounts");
      expect(rows.map((r) => r.id)).toEqual([otherAccount]);
    });
  });
});

describe("content permissions", () => {
  it("lets editors create drafts and viewers only read", async () => {
    const post = await createPost(editor, org.workspaceId, "Editor draft");
    await asUser(db, viewer, async (c) => {
      const { rows } = await c.query("select caption from content_posts where id = $1", [post]);
      expect(rows[0].caption).toBe("Editor draft");
      const err = await pgError(
        c.query("insert into content_posts (workspace_id, caption, created_by) values ($1, 'x', $2)", [org.workspaceId, viewer]),
      );
      expect(err.code).toBe("42501");
    });
  });

  it("blocks direct status changes to scheduled or published, and direct scheduled_at edits", async () => {
    const post = await createPost(editor, org.workspaceId);
    for (const status of ["scheduled", "published", "publishing", "simulated"]) {
      const err = await pgError(
        asUser(db, editor, (c) => c.query(`update content_posts set status = '${status}' where id = $1`, [post])),
      );
      expect(err.message, status).toMatch(/transition:post_status/);
    }
    const err = await pgError(
      asUser(db, editor, (c) => c.query("update content_posts set scheduled_at = now() where id = $1", [post])),
    );
    expect(err.code).toBe("42501");
  });

  it("increments the revision on every content edit", async () => {
    const post = await createPost(editor, org.workspaceId);
    await asUser(db, editor, (c) => c.query("update content_posts set caption = 'v2' where id = $1", [post]), { commit: true });
    await asUser(db, editor, (c) => c.query("update content_posts set status = 'ready' where id = $1", [post]), { commit: true });
    const { rows } = await db.sys.query("select revision, status from content_posts where id = $1", [post]);
    expect(rows[0]).toEqual({ revision: 2, status: "ready" });
  });

  it("rejects posts in workspaces the user cannot edit", async () => {
    const err = await pgError(
      asUser(db, outsider, (c) =>
        c.query("insert into content_posts (workspace_id, caption, created_by) values ($1, 'x', $2)", [org.workspaceId, outsider]),
      ),
    );
    expect(err.code).toBe("42501");
  });

  it("validates hashtags", async () => {
    const err = await pgError(
      asUser(db, editor, (c) =>
        c.query("insert into content_posts (workspace_id, caption, hashtags, created_by) values ($1, 'x', $2, $3)", [
          org.workspaceId,
          ["ok", "has space"],
          editor,
        ]),
      ),
    );
    expect(err.code).toBe("23514");
  });
});

describe("platform targets", () => {
  it("derives the platform from the account, ignoring the caller", async () => {
    const post = await createPost(editor, org.workspaceId);
    const target = await asUser(
      db,
      editor,
      async (c) => {
        const { rows } = await c.query(
          "insert into post_platform_targets (workspace_id, post_id, social_account_id, platform) values ($1, $2, $3, 'x') returning platform",
          [org.workspaceId, post, liAccount],
        );
        return rows[0];
      },
    ).catch((e) => e);
    // `platform` is not an insertable column for API roles at all.
    expect((target as { code?: string }).code).toBe("42501");
    const ok = await addTarget(editor, org.workspaceId, post, liAccount);
    expect(ok.platform).toBe("linkedin");
  });

  it("cannot target an account from another workspace", async () => {
    const post = await createPost(editor, org.workspaceId);
    const err = await pgError(addTarget(editor, org.workspaceId, post, otherAccount));
    expect(["23503", "42501"]).toContain(err.code);
  });

  it("requires provider confirmation before a target can be published", async () => {
    const post = await createPost(editor, org.workspaceId);
    const target = await addTarget(editor, org.workspaceId, post, igAccount);
    const err = await pgError(db.sys.query("update post_platform_targets set status = 'published' where id = $1", [target.id]));
    expect(err.message).toMatch(/targets_published_requires_confirmation/);
  });

  it("keeps target status out of reach of API roles", async () => {
    const post = await createPost(editor, org.workspaceId);
    const target = await addTarget(editor, org.workspaceId, post, igAccount);
    const err = await pgError(
      asUser(db, editor, (c) => c.query("update post_platform_targets set status = 'queued' where id = $1", [target.id])),
    );
    expect(err.code).toBe("42501");
  });
});

describe("scheduling", () => {
  it("creates one idempotent job per target and is safe to repeat", async () => {
    const post = await createPost(editor, org.workspaceId);
    const t1 = await addTarget(editor, org.workspaceId, post, igAccount);
    await addTarget(editor, org.workspaceId, post, liAccount);
    const when = inOneHour();
    const first = await asUser(db, editor, (c) => c.query("select app.schedule_post($1, $2, 'UTC') as n", [post, when]), {
      commit: true,
    });
    expect(first.rows[0].n).toBe(2);
    const again = await asUser(db, editor, (c) => c.query("select app.schedule_post($1, $2, 'UTC') as n", [post, when]), {
      commit: true,
    });
    expect(again.rows[0].n).toBe(2);
    const jobs = await db.sys.query("select status, idempotency_key from publishing_jobs where post_id = $1 order by created_at", [post]);
    expect(jobs.rows.filter((j) => j.status === "pending")).toHaveLength(2);
    expect(jobs.rows.every((j) => j.idempotency_key.startsWith("publish:"))).toBe(true);
    expect(jobs.rows.map((j) => j.idempotency_key)).toContain(`publish:${t1.id}:${Math.floor(Date.parse(when) / 1000)}`);
    const postRow = await db.sys.query("select status, schedule_timezone from content_posts where id = $1", [post]);
    expect(postRow.rows[0]).toEqual({ status: "scheduled", schedule_timezone: "UTC" });
  });

  it("cancels the previous job when rescheduled", async () => {
    const post = await createPost(editor, org.workspaceId);
    await addTarget(editor, org.workspaceId, post, igAccount);
    await asUser(db, editor, (c) => c.query("select app.schedule_post($1, $2, 'UTC')", [post, inOneHour()]), { commit: true });
    const later = new Date(Date.now() + 7_200_000).toISOString();
    await asUser(db, editor, (c) => c.query("select app.schedule_post($1, $2, 'UTC')", [post, later]), { commit: true });
    const { rows } = await db.sys.query("select status from publishing_jobs where post_id = $1 order by created_at", [post]);
    expect(rows.map((r) => r.status)).toEqual(["cancelled", "pending"]);
  });

  it("rejects past times, empty target lists, and viewers", async () => {
    const post = await createPost(editor, org.workspaceId);
    const noTargets = await pgError(asUser(db, editor, (c) => c.query("select app.schedule_post($1, $2, 'UTC')", [post, inOneHour()])));
    expect(noTargets.message).toBe("invalid:no_targets");
    await addTarget(editor, org.workspaceId, post, igAccount);
    const past = await pgError(
      asUser(db, editor, (c) => c.query("select app.schedule_post($1, now() - interval '1 hour', 'UTC')", [post])),
    );
    expect(past.message).toBe("invalid:schedule_in_past");
    const asViewer = await pgError(asUser(db, viewer, (c) => c.query("select app.schedule_post($1, $2, 'UTC')", [post, inOneHour()])));
    expect(asViewer.message).toBe("not_found");
  });

  it("enforces the monthly scheduling limit but ignores demo usage", async () => {
    const limited = await createOrganization(db, await createAuthUser(db.sys, "limited@test.test"), "Limited");
    const limitedOwner = (
      await db.sys.query("select user_id from organization_members where organization_id = $1", [limited.organizationId])
    ).rows[0].user_id as string;
    await db.sys.query(
      "insert into usage_records (organization_id, metric, quantity) select $1, 'post_scheduled', 1 from generate_series(1, 10)",
      [limited.organizationId],
    );
    await db.sys.query(
      "insert into usage_records (organization_id, metric, quantity, is_demo) select $1, 'post_scheduled', 1, true from generate_series(1, 50)",
      [limited.organizationId],
    );
    const account = await insertAccount(limited.workspaceId, limited.organizationId, "instagram", "connected");
    const post = await createPost(limitedOwner, limited.workspaceId);
    await addTarget(limitedOwner, limited.workspaceId, post, account);
    const err = await pgError(asUser(db, limitedOwner, (c) => c.query("select app.schedule_post($1, $2, 'UTC')", [post, inOneHour()])));
    expect(err.message).toBe("limit_exceeded:scheduled_posts_per_month");
  });

  it("cancels queued jobs when a post is archived or deleted", async () => {
    const post = await createPost(editor, org.workspaceId);
    await addTarget(editor, org.workspaceId, post, igAccount);
    await asUser(db, editor, (c) => c.query("select app.schedule_post($1, $2, 'UTC')", [post, inOneHour()]), { commit: true });
    await asUser(db, editor, (c) => c.query("update content_posts set status = 'archived' where id = $1", [post]), { commit: true });
    const { rows } = await db.sys.query("select status from publishing_jobs where post_id = $1", [post]);
    expect(rows.map((r) => r.status)).toEqual(["cancelled"]);
  });

  it("unschedules back to ready", async () => {
    const post = await createPost(editor, org.workspaceId);
    await addTarget(editor, org.workspaceId, post, igAccount);
    await asUser(db, editor, (c) => c.query("select app.schedule_post($1, $2, 'UTC')", [post, inOneHour()]), { commit: true });
    await asUser(db, editor, (c) => c.query("select app.unschedule_post($1)", [post]), { commit: true });
    const { rows } = await db.sys.query("select status, scheduled_at from content_posts where id = $1", [post]);
    expect(rows[0]).toEqual({ status: "ready", scheduled_at: null });
  });
});

describe("worker queue", () => {
  async function dueJobs(count: number) {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const post = await createPost(editor, org.workspaceId, `due ${i}`);
      await addTarget(editor, org.workspaceId, post, igAccount);
      await asUser(db, editor, (c) => c.query("select app.schedule_post($1, $2, 'UTC')", [post, inOneHour()]), { commit: true });
      const { rows } = await db.sys.query(
        "update publishing_jobs set run_at = now() - interval '1 minute' where post_id = $1 and status = 'pending' returning id",
        [post],
      );
      ids.push(rows[0].id);
    }
    return ids;
  }

  it("never hands the same job to two concurrent workers", async () => {
    await db.sys.query("update publishing_jobs set status = 'cancelled' where status = 'pending'");
    const ids = await dueJobs(6);
    const a = new Client({ connectionString: db.url });
    const b = new Client({ connectionString: db.url });
    await Promise.all([a.connect(), b.connect()]);
    try {
      await a.query("begin");
      await b.query("begin");
      const [ra, rb] = await Promise.all([
        a.query("select id from app.claim_publishing_jobs('worker-a', 4)"),
        b.query("select id from app.claim_publishing_jobs('worker-b', 4)"),
      ]);
      await Promise.all([a.query("commit"), b.query("commit")]);
      const claimedA = ra.rows.map((r) => r.id);
      const claimedB = rb.rows.map((r) => r.id);
      expect(claimedA.filter((id) => claimedB.includes(id))).toEqual([]);
      expect([...claimedA, ...claimedB].sort()).toEqual([...ids].sort());
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  });

  it("fails stale running jobs with an unknown outcome instead of retrying them", async () => {
    const [jobId] = await dueJobs(1);
    await db.sys.query("select * from app.claim_publishing_jobs('crashed-worker', 10)");
    await db.sys.query("update publishing_jobs set locked_at = now() - interval '1 hour' where id = $1", [jobId]);
    const { rows } = await db.sys.query("select app.recover_stale_jobs(interval '15 minutes') as n");
    expect(rows[0].n).toBeGreaterThanOrEqual(1);
    const job = await db.sys.query("select status, error_code from publishing_jobs where id = $1", [jobId]);
    expect(job.rows[0]).toEqual({ status: "failed", error_code: "outcome_unknown" });
  });

  it("lets editors retry failed jobs once, and only failed or blocked ones", async () => {
    const [jobId] = await dueJobs(1);
    const notYet = await pgError(asUser(db, editor, (c) => c.query("select app.retry_publishing_job($1)", [jobId])));
    expect(notYet.message).toBe("transition:job_not_retryable");
    await db.sys.query("update publishing_jobs set status = 'failed', completed_at = now() where id = $1", [jobId]);
    await asUser(db, editor, (c) => c.query("select app.retry_publishing_job($1)", [jobId]), { commit: true });
    const { rows } = await db.sys.query("select status, attempts from publishing_jobs where id = $1", [jobId]);
    expect(rows[0]).toEqual({ status: "pending", attempts: 0 });
    const viewerTry = await pgError(asUser(db, viewer, (c) => c.query("select app.retry_publishing_job($1)", [jobId])));
    expect(viewerTry.message).toBe("not_found");
  });

  it("derives post status from targets", async () => {
    const post = await createPost(editor, org.workspaceId);
    const a = await addTarget(editor, org.workspaceId, post, igAccount);
    const b = await addTarget(editor, org.workspaceId, post, liAccount);
    await asUser(db, editor, (c) => c.query("select app.schedule_post($1, $2, 'UTC')", [post, inOneHour()]), { commit: true });
    await db.sys.query(
      "update post_platform_targets set status = 'published', external_post_id = 'ig_1', published_at = now() where id = $1",
      [a.id],
    );
    await db.sys.query("update post_platform_targets set status = 'failed' where id = $1", [b.id]);
    const { rows } = await db.sys.query("select app.refresh_post_status($1) as s", [post]);
    expect(rows[0].s).toBe("partially_published");
  });
});

describe("analytics and AI history visibility", () => {
  it("shows analytics only inside the tenant and never accepts API writes", async () => {
    await db.sys.query(
      "insert into analytics_snapshots (workspace_id, social_account_id, platform, metric_date, data_source, followers) values ($1, $2, 'instagram', current_date, 'manual_import', 1200)",
      [org.workspaceId, igAccount],
    );
    await asUser(db, viewer, async (c) => {
      const { rows } = await c.query("select followers from analytics_snapshots");
      expect(rows.map((r) => Number(r.followers))).toEqual([1200]);
    });
    await asUser(db, outsider, async (c) => {
      const { rows } = await c.query("select 1 from analytics_snapshots");
      expect(rows).toHaveLength(0);
    });
    const err = await pgError(
      asUser(db, owner, (c) =>
        c.query(
          "insert into analytics_snapshots (workspace_id, social_account_id, platform, metric_date, data_source) values ($1, $2, 'instagram', current_date, 'provider_sync')",
          [org.workspaceId, igAccount],
        ),
      ),
    );
    expect(err.code).toBe("42501");
  });

  it("hides AI generation history from viewers", async () => {
    await db.sys.query(
      "insert into ai_generations (workspace_id, user_id, task, provider, is_demo_output, input, output) values ($1, $2, 'caption', 'demo', true, '{}', '[]')",
      [org.workspaceId, editor],
    );
    await asUser(db, viewer, async (c) => {
      expect((await c.query("select 1 from ai_generations")).rows).toHaveLength(0);
    });
    await asUser(db, editor, async (c) => {
      expect((await c.query("select 1 from ai_generations")).rows).toHaveLength(1);
    });
  });
});
