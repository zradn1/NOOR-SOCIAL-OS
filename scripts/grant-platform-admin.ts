/**
 * Grants or revokes platform admin rights (access to /admin). There is no UI
 * for this on purpose: it needs direct database access.
 *
 *   pnpm admin:grant someone@example.com [--note "on-call"]
 *   pnpm admin:grant someone@example.com --revoke
 *
 * Against a non-local database, add --yes after checking the host it prints.
 */
import { existsSync } from "node:fs";
import { getDb } from "@/server/db/client";
import { recordAudit } from "@/server/services/audit";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

function usage(message?: string): never {
  if (message) console.error(message);
  console.error('Usage: pnpm admin:grant <email> [--revoke] [--note "reason"] [--yes]');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--note")?.toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) usage("Give the user's email address.");
  const revoke = args.includes("--revoke");
  const noteIndex = args.indexOf("--note");
  const note = noteIndex >= 0 ? args[noteIndex + 1]?.slice(0, 200) : undefined;

  const url = process.env.DATABASE_URL;
  if (!url) usage("DATABASE_URL is not set.");
  const host = new URL(url).hostname;
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!local && !args.includes("--yes")) usage(`Target database host is ${host}. Re-run with --yes to confirm.`);

  const db = getDb();
  const profile = await db.selectFrom("profiles").select(["id", "email"]).where("email", "=", email).executeTakeFirst();
  if (!profile) usage(`No user with email ${email}. They need to sign up first.`);

  if (revoke) {
    const result = await db.deleteFrom("platform_admins").where("user_id", "=", profile.id).executeTakeFirst();
    if (!result.numDeletedRows) console.log(`${email} was not a platform admin.`);
    else console.log(`Revoked platform admin from ${email}.`);
  } else {
    await db
      .insertInto("platform_admins")
      .values({ user_id: profile.id, note: note ?? null })
      .onConflict((oc) => oc.column("user_id").doUpdateSet({ note: note ?? null }))
      .execute();
    console.log(`${email} is now a platform admin. They can open /admin.`);
  }
  await recordAudit({
    action: revoke ? "admin.platform_admin_revoked" : "admin.platform_admin_granted",
    actorType: "system",
    targetType: "user",
    targetId: profile.id,
    metadata: { via: "cli", note: note ?? null },
  });
}

main()
  .then(() => getDb().destroy())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await getDb().destroy();
    process.exit(1);
  });
