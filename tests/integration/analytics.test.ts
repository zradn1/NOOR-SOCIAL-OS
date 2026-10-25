import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DateRange } from "@/lib/analytics/aggregate";
import type { DB } from "@/server/db/schema.generated";
import type { AppError } from "@/server/errors";
import { getAnalyticsOverview, getMetricSeries } from "@/server/services/analytics";
import { canImportAnalytics, importAccountMetrics } from "@/server/services/analytics-import";
import { addMember, asUser, assignWorkspace, createAuthUser, createOrganization, createTestDb, setPlan, type OrgFixture, type TestDb } from "../support/db";
import { contextFor, kyselyFor } from "../support/services";

let db: TestDb;
let k: Kysely<DB>;
let owner: string;
let viewer: string;
let outsider: string;
let org: OrgFixture;
let otherOrg: OrgFixture;
let demoWs: string;
let igManual: string;
let liManual: string;
let liConnected: string;
let foreignManual: string;

const RANGE: DateRange = { from: "2026-10-01", to: "2026-10-07" };

async function account(workspaceId: string, organizationId: string, platform: string, status: "manual" | "connected") {
  const { rows } = await db.sys.query(
    `insert into social_accounts (workspace_id, organization_id, platform, display_name, external_account_id, connection_status, connected_at)
     values ($1, $2, $3::social_platform, $3::text, $4, $5::connection_status, case when $5::connection_status = 'connected' then now() end) returning id`,
    [workspaceId, organizationId, platform, `${status === "manual" ? "manual" : "ext"}_${platform}_${Math.random().toString(36).slice(2, 8)}`, status],
  );
  return rows[0].id as string;
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }
  throw new Error("expected the call to fail");
}

beforeAll(async () => {
  db = await createTestDb();
  k = kyselyFor(db);
  owner = await createAuthUser(db.sys, "owner@analytics.test");
  viewer = await createAuthUser(db.sys, "viewer@analytics.test");
  outsider = await createAuthUser(db.sys, "outsider@analytics.test");
  org = await createOrganization(db, owner, "Analytics Co");
  otherOrg = await createOrganization(db, outsider, "Elsewhere");
  await addMember(db, org.organizationId, viewer, "viewer");
  await assignWorkspace(db, org.workspaceId, org.organizationId, viewer, "viewer");
  demoWs = await asUser(
    db,
    owner,
    async (c) => (await c.query("select * from app.create_workspace($1, 'Demo', 'internal', 'UTC', null, true)", [org.organizationId])).rows[0].workspace_id,
    { commit: true },
  );
  igManual = await account(org.workspaceId, org.organizationId, "instagram", "manual");
  liManual = await account(org.workspaceId, org.organizationId, "linkedin", "manual");
  liConnected = await account(org.workspaceId, org.organizationId, "linkedin", "connected");
  foreignManual = await account(otherOrg.workspaceId, otherOrg.organizationId, "instagram", "manual");
});

afterAll(async () => {
  await k?.destroy();
  await db?.close();
});

const IG_CSV = "date,followers,reach,likes,comments\n2026-10-01,1000,5000,200,10\n2026-10-02,1010,,210,12\n2026-10-03,1025,5200,190,9\n";

describe("metric import gating", () => {
  it("is not available on the free plan", async () => {
    const ctx = await contextFor(db, owner, org.workspaceId);
    expect(await canImportAnalytics(ctx, k)).toBe(false);
    const err = await errorOf(importAccountMetrics(ctx, { accountId: igManual, csv: IG_CSV }, {}, k));
    expect(err.code).toBe("PLAN_FEATURE");
  });

  it("requires the analyst role", async () => {
    await setPlan(db, org.organizationId, "starter");
    const ctx = await contextFor(db, viewer, org.workspaceId);
    const err = await errorOf(importAccountMetrics(ctx, { accountId: igManual, csv: IG_CSV }, {}, k));
    expect(err.code).toBe("FORBIDDEN");
  });

  it("refuses demo workspaces", async () => {
    const ctx = await contextFor(db, owner, demoWs);
    const err = await errorOf(importAccountMetrics(ctx, { accountId: igManual, csv: IG_CSV }, {}, k));
    expect(err.code).toBe("VALIDATION");
  });

  it("only imports into manually tracked accounts", async () => {
    const ctx = await contextFor(db, owner, org.workspaceId);
    const err = await errorOf(importAccountMetrics(ctx, { accountId: liConnected, csv: "date,followers\n2026-10-01,5\n" }, {}, k));
    expect(err.code).toBe("VALIDATION");
  });

  it("cannot reach an account in another organization", async () => {
    const ctx = await contextFor(db, owner, org.workspaceId);
    const err = await errorOf(importAccountMetrics(ctx, { accountId: foreignManual, csv: IG_CSV }, {}, k));
    expect(err.code).toBe("NOT_FOUND");
    const { rows } = await db.sys.query("select count(*)::int as n from analytics_snapshots where social_account_id = $1", [foreignManual]);
    expect(rows[0].n).toBe(0);
  });

  it("rejects a file with row errors and writes nothing", async () => {
    const ctx = await contextFor(db, owner, org.workspaceId);
    const err = await errorOf(importAccountMetrics(ctx, { accountId: igManual, csv: "date,followers\n2026-10-01,-4\n2099-01-01,5\n" }, {}, k));
    expect(err.code).toBe("VALIDATION");
    expect((err.details?.errors as string[]).length).toBe(2);
    const { rows } = await db.sys.query("select count(*)::int as n from analytics_snapshots where social_account_id = $1", [igManual]);
    expect(rows[0].n).toBe(0);
  });
});

describe("metric import", () => {
  it("stores rows as manual imports, keeping blanks unavailable", async () => {
    const ctx = await contextFor(db, owner, org.workspaceId);
    const result = await importAccountMetrics(ctx, { accountId: igManual, csv: IG_CSV }, {}, k);
    expect(result.rows).toBe(3);
    const { rows } = await db.sys.query(
      "select metric_date::text, data_source::text, followers, reach, is_demo from analytics_snapshots where social_account_id = $1 order by metric_date",
      [igManual],
    );
    expect(rows.map((r) => r.data_source)).toEqual(["manual_import", "manual_import", "manual_import"]);
    expect(rows[1]).toMatchObject({ metric_date: "2026-10-02", followers: 1010, reach: null, is_demo: false });
  });

  it("re-importing a day replaces it instead of duplicating", async () => {
    const ctx = await contextFor(db, owner, org.workspaceId);
    await importAccountMetrics(ctx, { accountId: igManual, csv: "date,followers\n2026-10-03,1030\n" }, {}, k);
    const { rows } = await db.sys.query("select followers from analytics_snapshots where social_account_id = $1 and metric_date = '2026-10-03'", [igManual]);
    expect(rows).toEqual([{ followers: 1030 }]);
  });

  it("records usage and an audit entry", async () => {
    const usage = await db.sys.query("select sum(quantity)::int as n from usage_records where organization_id = $1 and metric = 'analytics_import'", [org.organizationId]);
    expect(usage.rows[0].n).toBe(4);
    const audit = await db.sys.query("select count(*)::int as n from audit_logs where organization_id = $1 and action = 'analytics.imported'", [org.organizationId]);
    expect(audit.rows[0].n).toBe(2);
  });
});

describe("analytics filtering", () => {
  beforeAll(async () => {
    const ctx = await contextFor(db, owner, org.workspaceId);
    await importAccountMetrics(ctx, { accountId: liManual, csv: "date,followers,impressions,likes\n2026-10-01,300,900,30\n2026-10-02,305,1100,40\n" }, {}, k);
  });

  it("platform filter limits the rows considered", async () => {
    const ctx = await contextFor(db, owner, org.workspaceId);
    const all = await getAnalyticsOverview(ctx, RANGE, null, k);
    expect(all.byPlatform.map((p) => p.platform).sort()).toEqual(["instagram", "linkedin"]);
    const onlyLi = await getAnalyticsOverview(ctx, RANGE, ["linkedin"], k);
    expect(onlyLi.byPlatform.map((p) => p.platform)).toEqual(["linkedin"]);
    expect(onlyLi.provenance).toBe("manual_import");
  });

  it("reports missing days and unreported metrics as null, never zero", async () => {
    const ctx = await contextFor(db, owner, org.workspaceId);
    const reach = await getMetricSeries(ctx, RANGE, ["instagram"], "reach", k);
    const byDate = Object.fromEntries(reach.series.map((p) => [p.date, p.total]));
    expect(byDate["2026-10-01"]).toBe(5000);
    expect(byDate["2026-10-02"]).toBeNull();
    expect(byDate["2026-10-05"]).toBeNull();
    // LinkedIn imports had no reach column.
    const liReach = await getMetricSeries(ctx, RANGE, ["linkedin"], "reach", k);
    expect(liReach.series.every((p) => p.total === null)).toBe(true);
  });

  it("viewers can read analytics they can't import", async () => {
    const ctx = await contextFor(db, viewer, org.workspaceId);
    const overview = await getAnalyticsOverview(ctx, RANGE, null, k);
    expect(overview.byPlatform.length).toBe(2);
  });

  it("another tenant sees nothing even with a forged context", async () => {
    const forged = { ...(await contextFor(db, owner, org.workspaceId)) };
    forged.identity = { userId: outsider, email: "outsider@analytics.test", sessionId: null };
    const overview = await getAnalyticsOverview(forged, RANGE, null, k);
    expect(overview.byPlatform).toEqual([]);
    const series = await getMetricSeries(forged, RANGE, null, "followers", k);
    expect(series.series.every((p) => p.total === null)).toBe(true);
  });
});
