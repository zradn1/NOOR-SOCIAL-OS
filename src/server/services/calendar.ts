import "server-only";
import { sql } from "kysely";
import type { Platform } from "@/lib/platforms/registry";
import { zonedRangeToUtc, zonedToUtc, type LocalDate } from "@/lib/time/zoned";
import { assertCan, type WorkspaceContext } from "@/server/auth/context";
import { getDb, withUser } from "@/server/db/client";
import { notFound } from "@/server/errors";

export type CalendarItem = {
  id: string;
  title: string | null;
  caption: string;
  status: string;
  /** The instant that places the item on the calendar. */
  at: string;
  kind: "scheduled" | "planned" | "published";
  platforms: Platform[];
};

/** Posts placed on the calendar between two local dates in the workspace zone. */
export async function getCalendarItems(
  ctx: WorkspaceContext,
  from: LocalDate,
  to: LocalDate,
  platforms: Platform[] | null,
  db = getDb(),
): Promise<CalendarItem[]> {
  const { start, end } = zonedRangeToUtc(from, to, ctx.workspace.timezone);
  const rows = await withUser(
    ctx.identity,
    (trx) => {
      let q = trx
        .selectFrom("content_posts as p")
        .select([
          "p.id",
          "p.title",
          "p.caption",
          "p.status",
          "p.scheduled_at",
          "p.planned_for",
          "p.published_at",
          (eb) =>
            eb
              .selectFrom("post_platform_targets as t")
              .select(sql<string[]>`coalesce(array_agg(distinct t.platform::text), '{}')`.as("platforms"))
              .whereRef("t.post_id", "=", "p.id")
              .where("t.status", "<>", "cancelled")
              .as("platforms"),
        ])
        .where("p.workspace_id", "=", ctx.workspace.id)
        .where("p.status", "<>", "archived")
        .where(sql<boolean>`coalesce(p.scheduled_at, p.published_at, p.planned_for) >= ${start} and coalesce(p.scheduled_at, p.published_at, p.planned_for) < ${end}`);
      if (platforms?.length) {
        q = q.where((eb) =>
          eb.exists(
            eb
              .selectFrom("post_platform_targets as t2")
              .select("t2.id")
              .whereRef("t2.post_id", "=", "p.id")
              .where("t2.platform", "in", platforms),
          ),
        );
      }
      return q.orderBy(sql`coalesce(p.scheduled_at, p.published_at, p.planned_for)`).execute();
    },
    db,
  );
  return rows.map((r) => {
    const at = (r.scheduled_at ?? r.published_at ?? r.planned_for)!;
    const kind: CalendarItem["kind"] = r.scheduled_at
      ? ["published", "partially_published", "simulated"].includes(r.status)
        ? "published"
        : "scheduled"
      : r.published_at
        ? "published"
        : "planned";
    return {
      id: r.id,
      title: r.title,
      caption: r.caption,
      status: r.status,
      at: at.toISOString(),
      kind,
      platforms: (r.platforms ?? []) as Platform[],
    };
  });
}

/** Moves a draft's planned date (planning only; never schedules publishing). */
export async function setPlannedDate(ctx: WorkspaceContext, postId: string, date: LocalDate | null, time: string, db = getDb()) {
  assertCan(ctx, "content.edit");
  const plannedFor = date ? zonedToUtc(date, time, ctx.workspace.timezone) : null;
  const result = await withUser(
    ctx.identity,
    (trx) =>
      trx
        .updateTable("content_posts")
        .set({ planned_for: plannedFor, updated_by: ctx.user.id })
        .where("id", "=", postId)
        .where("workspace_id", "=", ctx.workspace.id)
        .where("status", "in", ["draft", "ready"])
        .executeTakeFirst(),
    db,
  );
  if (!result.numUpdatedRows) throw notFound("Only drafts can be moved on the calendar without scheduling.");
}
