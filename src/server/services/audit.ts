import "server-only";
import type { Executor } from "@/server/db/client";
import { getDb } from "@/server/db/client";
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
