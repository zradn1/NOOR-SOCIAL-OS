import "server-only";
import { sql } from "kysely";
import { aiStatus } from "@/server/ai/provider";
import { billingStatus } from "@/server/billing";
import { getDb, withSystem, type Executor } from "@/server/db/client";
import { configurationStatus } from "@/server/env";
import { AppError, forbidden, notFound } from "@/server/errors";
import { listProviderStatuses } from "@/server/integrations/registry";
import { recordAudit } from "./audit";

/**
 * Platform administration for Noor Studio operators. Everything here reads
 * across tenants through the privileged connection, so every entry point is
 * reached only after a platform-admin check, and every change is audited.
 */

type Meta = { ipHash?: string | null; userAgent?: string | null };
type Db = ReturnType<typeof getDb>;

async function assertPlatformAdmin(userId: string, db: Executor) {
  const row = await db.selectFrom("platform_admins").select("user_id").where("user_id", "=", userId).executeTakeFirst();
  if (!row) throw forbidden();
}

export async function adminOverview(db: Db = getDb()) {
  const count = async (query: ReturnType<typeof sql<{ n: number }>>) => Number((await query.execute(db)).rows[0]?.n ?? 0);
  const [users, suspended, organizations, workspaces, demoWorkspaces, accounts, plans, jobs, failedEvents, aiThisMonth] = await Promise.all([
    count(sql<{ n: number }>`select count(*)::int as n from auth.users where deleted_at is null`),
    count(sql<{ n: number }>`select count(*)::int as n from auth.users where banned_until > now()`),
    count(sql<{ n: number }>`select count(*)::int as n from public.organizations where deleted_at is null`),
    count(sql<{ n: number }>`select count(*)::int as n from public.workspaces where deleted_at is null and not is_demo`),
    count(sql<{ n: number }>`select count(*)::int as n from public.workspaces where deleted_at is null and is_demo`),
    db
      .selectFrom("social_accounts")
      .select(["connection_status", (eb) => eb.fn.countAll<number>().as("n")])
      .where("deleted_at", "is", null)
      .groupBy("connection_status")
      .execute(),
    db
      .selectFrom("subscriptions")
      .select(["plan_id", "status", "provider", (eb) => eb.fn.countAll<number>().as("n")])
      .groupBy(["plan_id", "status", "provider"])
      .execute(),
    db
      .selectFrom("publishing_jobs")
      .select(["status", (eb) => eb.fn.countAll<number>().as("n")])
      .where("updated_at", ">", sql<Date>`now() - interval '7 days'`)
      .groupBy("status")
      .execute(),
    count(sql<{ n: number }>`select count(*)::int as n from public.billing_events where outcome = 'failed'`),
    count(sql<{ n: number }>`select coalesce(sum(quantity), 0)::int as n from public.usage_records where metric = 'ai_generation' and occurred_at >= date_trunc('month', now())`),
  ]);
  return {
    users,
    suspended,
    organizations,
    workspaces,
    demoWorkspaces,
    accounts: accounts.map((a) => ({ status: a.connection_status, n: Number(a.n) })),
    plans: plans.map((p) => ({ planId: p.plan_id, status: p.status, provider: p.provider, n: Number(p.n) })),
    jobs: jobs.map((j) => ({ status: j.status, n: Number(j.n) })),
    failedBillingEvents: failedEvents,
    aiGenerationsThisMonth: aiThisMonth,
  };
}

export async function systemHealth(db: Db = getDb()) {
  const started = performance.now();
  let database: { ok: boolean; latencyMs: number | null; error?: string };
  try {
    await sql`select 1`.execute(db);
    database = { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    database = { ok: false, latencyMs: null, error: error instanceof Error ? error.message.slice(0, 200) : "unreachable" };
  }
  const heartbeats = database.ok ? await db.selectFrom("system_heartbeats").selectAll().orderBy("component").execute() : [];
  const queue = database.ok
    ? await db
        .selectFrom("publishing_jobs")
        .select([
          sql<number>`count(*) filter (where status = 'pending' and run_at <= now())::int`.as("due"),
          sql<number>`count(*) filter (where status = 'pending' and run_at <= now() - interval '10 minutes')::int`.as("overdue"),
          sql<number>`count(*) filter (where status = 'running')::int`.as("running"),
        ])
        .executeTakeFirst()
    : null;
  return {
    database,
    heartbeats: heartbeats.map((h) => ({ component: h.component, lastSeenAt: new Date(h.last_seen_at).toISOString(), metadata: h.metadata })),
    queue: queue ? { due: Number(queue.due), overdue: Number(queue.overdue), running: Number(queue.running) } : null,
    configuration: configurationStatus(),
    ai: aiStatus(),
    billing: billingStatus(),
    integrations: listProviderStatuses(),
  };
}

export type AdminUserRow = {
  id: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  confirmed: boolean;
  suspended: boolean;
  organizations: number;
  isPlatformAdmin: boolean;
};

export async function listUsers(query: { q?: string; limit?: number } = {}, db: Db = getDb()): Promise<AdminUserRow[]> {
  const q = query.q?.trim().toLowerCase().slice(0, 100) ?? "";
  const { rows } = await sql<{
    id: string;
    email: string;
    full_name: string | null;
    created_at: Date;
    last_sign_in_at: Date | null;
    confirmed: boolean;
    suspended: boolean;
    organizations: number;
    is_platform_admin: boolean;
  }>`
    select u.id, u.email, p.full_name, u.created_at, u.last_sign_in_at,
           u.email_confirmed_at is not null as confirmed,
           coalesce(u.banned_until > now(), false) as suspended,
           (select count(*)::int from public.organization_members m where m.user_id = u.id) as organizations,
           exists (select 1 from public.platform_admins a where a.user_id = u.id) as is_platform_admin
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.deleted_at is null
      and (${q} = '' or lower(u.email) like '%' || ${q} || '%' or lower(coalesce(p.full_name, '')) like '%' || ${q} || '%')
    order by u.created_at desc
    limit ${Math.min(query.limit ?? 50, 200)}
  `.execute(db);
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    createdAt: new Date(r.created_at).toISOString(),
    lastSignInAt: r.last_sign_in_at ? new Date(r.last_sign_in_at).toISOString() : null,
    confirmed: r.confirmed,
    suspended: r.suspended,
    organizations: r.organizations,
    isPlatformAdmin: r.is_platform_admin,
  }));
}

export type AdminOrganizationRow = {
  id: string;
  name: string;
  owner: string | null;
  planId: string;
  status: string;
  provider: string;
  workspaces: number;
  demoWorkspaces: number;
  members: number;
  guests: number;
  createdAt: string;
};

export async function listOrganizations(query: { q?: string; limit?: number } = {}, db: Db = getDb()): Promise<AdminOrganizationRow[]> {
  const q = query.q?.trim().toLowerCase().slice(0, 100) ?? "";
  const { rows } = await sql<{
    id: string;
    name: string;
    owner: string | null;
    plan_id: string;
    status: string;
    provider: string;
    workspaces: number;
    demo_workspaces: number;
    members: number;
    guests: number;
    created_at: Date;
  }>`
    select o.id, o.name,
           (select p.email from public.organization_members m join public.profiles p on p.id = m.user_id
             where m.organization_id = o.id and m.role = 'owner' order by m.created_at limit 1) as owner,
           s.plan_id, s.status::text as status, s.provider,
           (select count(*)::int from public.workspaces w where w.organization_id = o.id and w.deleted_at is null and not w.is_demo) as workspaces,
           (select count(*)::int from public.workspaces w where w.organization_id = o.id and w.deleted_at is null and w.is_demo) as demo_workspaces,
           (select count(*)::int from public.organization_members m where m.organization_id = o.id and not m.is_client_guest) as members,
           (select count(*)::int from public.organization_members m where m.organization_id = o.id and m.is_client_guest) as guests,
           o.created_at
    from public.organizations o
    join public.subscriptions s on s.organization_id = o.id
    where o.deleted_at is null
      and (${q} = '' or lower(o.name) like '%' || ${q} || '%' or o.slug like '%' || ${q} || '%')
    order by o.created_at desc
    limit ${Math.min(query.limit ?? 50, 200)}
  `.execute(db);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    owner: r.owner,
    planId: r.plan_id,
    status: r.status,
    provider: r.provider,
    workspaces: r.workspaces,
    demoWorkspaces: r.demo_workspaces,
    members: r.members,
    guests: r.guests,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function listProblemJobs(limit = 50, db: Db = getDb()) {
  const rows = await db
    .selectFrom("publishing_jobs as j")
    .innerJoin("post_platform_targets as t", "t.id", "j.target_id")
    .innerJoin("workspaces as w", "w.id", "j.workspace_id")
    .innerJoin("organizations as o", "o.id", "w.organization_id")
    .select(["j.id", "j.status", "t.platform", "j.attempts", "j.error_code", "j.last_error", "j.updated_at", "j.is_demo", "w.name as workspace", "w.slug", "o.name as organization"])
    .where("j.status", "in", ["failed", "blocked"])
    .orderBy("j.updated_at", "desc")
    .limit(limit)
    .execute();
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    platform: r.platform,
    attempts: r.attempts,
    errorCode: r.error_code,
    lastError: r.last_error,
    updatedAt: new Date(r.updated_at).toISOString(),
    isDemo: r.is_demo,
    workspace: r.workspace,
    slug: r.slug,
    organization: r.organization,
  }));
}

export async function listAuditLogs(query: { action?: string; organizationId?: string; limit?: number } = {}, db: Db = getDb()) {
  let q = db
    .selectFrom("audit_logs as a")
    .leftJoin("profiles as p", "p.id", "a.actor_id")
    .leftJoin("organizations as o", "o.id", "a.organization_id")
    .select(["a.id", "a.action", "a.actor_type", "a.target_type", "a.target_id", "a.metadata", "a.is_demo", "a.created_at", "p.email as actor", "o.name as organization"])
    .orderBy("a.created_at", "desc")
    .orderBy("a.id", "desc")
    .limit(Math.min(query.limit ?? 100, 500));
  if (query.action) q = q.where("a.action", "like", `${query.action.replace(/[%_\\]/g, "")}%`);
  if (query.organizationId) q = q.where("a.organization_id", "=", query.organizationId);
  const rows = await q.execute();
  return rows.map((r) => ({
    id: String(r.id),
    action: r.action,
    actorType: r.actor_type,
    actor: r.actor,
    organization: r.organization,
    target: r.target_type ? `${r.target_type}${r.target_id ? `:${r.target_id.slice(0, 12)}` : ""}` : null,
    metadata: r.metadata as Record<string, unknown>,
    isDemo: r.is_demo,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

const ASSIGNABLE_PLANS = ["free", "starter", "pro", "agency"] as const;

/**
 * Assigns a plan without a payment provider (invoiced customers, partners,
 * support credits). Refused while a live Stripe subscription exists so the
 * two sources of truth can't diverge.
 */
export async function setOrganizationPlan(
  actorId: string,
  input: { organizationId: string; planId: string; reason: string },
  meta: Meta = {},
  db: Db = getDb(),
) {
  if (!(ASSIGNABLE_PLANS as readonly string[]).includes(input.planId)) throw new AppError("VALIDATION", "Unknown plan.");
  if (input.reason.trim().length < 4) throw new AppError("VALIDATION", "Give a short reason; it goes into the audit log.");
  await withSystem(async (trx) => {
    await assertPlatformAdmin(actorId, trx);
    const current = await trx
      .selectFrom("subscriptions")
      .select(["id", "plan_id", "status", "provider", "provider_subscription_id"])
      .where("organization_id", "=", input.organizationId)
      .forUpdate()
      .executeTakeFirst();
    if (!current) throw notFound("That organization doesn't exist.");
    if (current.provider === "stripe" && current.provider_subscription_id && ["active", "trialing", "past_due"].includes(current.status)) {
      throw new AppError("CONFLICT", "This organization pays through Stripe. Change the plan there so billing stays consistent.");
    }
    const free = input.planId === "free";
    await trx
      .updateTable("subscriptions")
      .set({ plan_id: input.planId, status: "active", provider: free ? "none" : "manual", cancel_at_period_end: false, pending_plan_id: null })
      .where("id", "=", current.id)
      .execute();
    await recordAudit(
      {
        action: "admin.plan_assigned",
        organizationId: input.organizationId,
        actorId,
        actorType: "platform_admin",
        targetType: "subscription",
        targetId: current.id,
        metadata: { from: { plan: current.plan_id, provider: current.provider }, to: { plan: input.planId }, reason: input.reason.trim().slice(0, 300) },
        ...meta,
      },
      trx,
    );
  }, db);
}

/**
 * Suspends or restores a user. Suspension is enforced by Supabase Auth (no
 * new sessions) and checked on every request by the app.
 */
export async function setUserSuspended(
  actorId: string,
  input: { userId: string; suspended: boolean; reason: string },
  auth: { ban: (userId: string, suspended: boolean) => Promise<void> },
  meta: Meta = {},
  db: Db = getDb(),
) {
  if (input.reason.trim().length < 4) throw new AppError("VALIDATION", "Give a short reason; it goes into the audit log.");
  await assertPlatformAdmin(actorId, db);
  if (input.userId === actorId) throw new AppError("VALIDATION", "You can't suspend yourself.");
  const target = await db.selectFrom("profiles").select("id").where("id", "=", input.userId).executeTakeFirst();
  if (!target) throw notFound("That user doesn't exist.");
  const isAdmin = await db.selectFrom("platform_admins").select("user_id").where("user_id", "=", input.userId).executeTakeFirst();
  if (isAdmin && input.suspended) throw new AppError("VALIDATION", "Remove platform admin rights before suspending this user.");
  await auth.ban(input.userId, input.suspended);
  await recordAudit(
    {
      action: input.suspended ? "admin.user_suspended" : "admin.user_restored",
      actorId,
      actorType: "platform_admin",
      targetType: "user",
      targetId: input.userId,
      metadata: { reason: input.reason.trim().slice(0, 300) },
      ...meta,
    },
    db,
  );
}
