import "server-only";
import type { RlsIdentity } from "@/server/db/client";
import { getDb, withUser } from "@/server/db/client";

export async function getProfile(identity: RlsIdentity, db = getDb()) {
  const row = await withUser(
    identity,
    (trx) =>
      trx
        .selectFrom("profiles")
        .select(["id", "email", "full_name", "timezone"])
        .where("id", "=", identity.userId)
        .executeTakeFirst(),
    db,
  );
  return {
    id: identity.userId,
    email: row?.email ?? identity.email ?? "",
    fullName: row?.full_name ?? "",
    timezone: row?.timezone ?? "UTC",
  };
}

export async function updateProfile(identity: RlsIdentity, input: { fullName: string; timezone: string }, db = getDb()) {
  await withUser(
    identity,
    (trx) =>
      trx
        .updateTable("profiles")
        .set({ full_name: input.fullName, timezone: input.timezone })
        .where("id", "=", identity.userId)
        .execute(),
    db,
  );
}
