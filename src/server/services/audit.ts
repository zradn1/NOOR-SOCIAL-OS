import "server-only";
import { assertCan, type WorkspaceContext } from "@/server/auth/guard";
import type { Executor } from "@/server/db/client";
import { getDb, withUser } from "@/server/db/client";
import { logger } from "@/server/observability/logger";

export type AuditEntry = {
  action: string;
  organizationId?: string | null;
  workspaceId?: string | null;
  actorId?: string | null;
  actorType?: "user" | "system" | "platform_admin";
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
  userAgent?: string | null;
  isDemo?: boolean;
};

/**
 * Appends an audit record through the privileged connection. Pass a system
 * transaction to make the record atomic with the change it describes.
 */
export async function recordAudit(entry: AuditEntry, executor: Executor = getDb()) {
  try {
    await executor
      .insertInto("audit_logs")
      .values({
        action: entry.action,
        organization_id: entry.organizationId ?? null,
        workspace_id: entry.workspaceId ?? null,
        actor_id: entry.actorId ?? null,
        actor_type: entry.actorType ?? "user",
        target_type: entry.targetType ?? null,
        target_id: entry.targetId ?? null,
        metadata: JSON.stringify(entry.metadata ?? {}),
        ip_hash: entry.ipHash ?? null,
        user_agent: entry.userAgent ?? null,
        is_demo: entry.isDemo ?? false,
      })
      .execute();
  } catch (error) {
    // Losing an audit record must be visible in logs. Callers inside a
    // transaction still see the error and roll back.
    logger.error("audit.write_failed", { action: entry.action, error });
    throw error;
  }
}

export type OrganizationAuditEntry = {
  id: string;
  action: string;
  actor: string | null;
  actorType: string;
  workspace: string | null;
  target: string | null;
  createdAt: string;
};

/**
 * The organization's audit trail for its admins. RLS limits rows to
 * organizations where the user is an admin and the plan includes `audit_log`.
 */
export async function listOrganizationAudit(
  ctx: WorkspaceContext,
  query: { action?: string; limit?: number } = {},
  db = getDb(),
): Promise<OrganizationAuditEntry[]> {
  assertCan(ctx, "org.audit.view");
  const rows = await withUser(
    ctx.identity,
    (trx) => {
      let q = trx
        .selectFrom("audit_logs as a")
        .leftJoin("profiles as p", "p.id", "a.actor_id")
        .leftJoin("workspaces as w", "w.id", "a.workspace_id")
        .select(["a.id", "a.action", "a.actor_type", "a.target_type", "a.created_at", "p.email as actor", "w.name as workspace"])
        .where("a.organization_id", "=", ctx.organization.id)
        .orderBy("a.created_at", "desc")
        .orderBy("a.id", "desc")
        .limit(Math.min(query.limit ?? 100, 300));
      if (query.action) q = q.where("a.action", "like", `${query.action.replace(/[%_\\]/g, "")}%`);
      return q.execute();
    },
    db,
  );
  return rows.map((r) => ({
    id: String(r.id),
    action: r.action,
    actor: r.actor,
    actorType: r.actor_type,
    workspace: r.workspace,
    target: r.target_type,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
