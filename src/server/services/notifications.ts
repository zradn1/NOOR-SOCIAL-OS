import "server-only";
import type { Executor, RlsIdentity } from "@/server/db/client";
import { getDb, withUser } from "@/server/db/client";

export type NotificationItem = {
  id: string;
  kind: string;
  severity: "info" | "success" | "warning" | "error";
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function listNotifications(identity: RlsIdentity, limit = 12, db = getDb()) {
  return withUser(
    identity,
    async (trx) => {
      const rows = await trx
        .selectFrom("notifications")
        .select(["id", "kind", "severity", "title", "body", "link", "read_at", "created_at"])
        .where("user_id", "=", identity.userId)
        .orderBy("created_at", "desc")
        .limit(limit)
        .execute();
      const unread = await trx
        .selectFrom("notifications")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("user_id", "=", identity.userId)
        .where("read_at", "is", null)
        .executeTakeFirstOrThrow();
      return {
        unread: Number(unread.count),
        items: rows.map(
          (r): NotificationItem => ({
            id: r.id,
            kind: r.kind,
            severity: r.severity as NotificationItem["severity"],
            title: r.title,
            body: r.body,
            link: r.link,
            readAt: r.read_at?.toISOString() ?? null,
            createdAt: r.created_at.toISOString(),
          }),
        ),
      };
    },
    db,
  );
}

export async function markAllNotificationsRead(identity: RlsIdentity, db = getDb()) {
  await withUser(
    identity,
    (trx) =>
      trx
        .updateTable("notifications")
        .set({ read_at: new Date() })
        .where("user_id", "=", identity.userId)
        .where("read_at", "is", null)
        .execute(),
    db,
  );
}

/** System-side: notify a user. `executor` may be a system transaction. */
export async function notify(
  executor: Executor,
  n: {
    userId: string;
    organizationId?: string | null;
    workspaceId?: string | null;
    kind: string;
    severity?: NotificationItem["severity"];
    title: string;
    body?: string | null;
    link?: string | null;
  },
) {
  await executor
    .insertInto("notifications")
    .values({
      user_id: n.userId,
      organization_id: n.organizationId ?? null,
      workspace_id: n.workspaceId ?? null,
      kind: n.kind,
      severity: n.severity ?? "info",
      title: n.title.slice(0, 160),
      body: n.body?.slice(0, 500) ?? null,
      link: n.link ?? null,
    })
    .execute();
}

/** Notifies everyone with at least `minRank` in a workspace (admins by default). */
export async function notifyWorkspaceAdmins(
  executor: Executor,
  workspaceId: string,
  n: Omit<Parameters<typeof notify>[1], "userId" | "workspaceId">,
) {
  const recipients = await executor
    .selectFrom("workspaces as w")
    .innerJoin("organization_members as om", "om.organization_id", "w.organization_id")
    .leftJoin("workspace_members as wm", (join) =>
      join.onRef("wm.workspace_id", "=", "w.id").onRef("wm.user_id", "=", "om.user_id"),
    )
    .select("om.user_id")
    .where("w.id", "=", workspaceId)
    .where((eb) => eb.or([eb("om.role", "in", ["owner", "admin"]), eb("wm.role", "in", ["admin", "editor"])]))
    .execute();
  for (const r of recipients) {
    await notify(executor, { ...n, userId: r.user_id, workspaceId });
  }
}
