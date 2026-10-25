/**
 * Seeds a local development database with a sign-in-ready agency setup:
 * an owner, an editor, a client guest, two client workspaces, a manually
 * tracked account, and a demo workspace with simulated data.
 *
 *   pnpm db:reset && pnpm db:seed
 *
 * Local only: refuses to run in production or against a non-local database.
 * Sign in with any seeded address and the password printed at the end.
 */
import { existsSync } from "node:fs";
import bcrypt from "bcryptjs";
import { sql } from "kysely";
import type { WorkspaceContext } from "@/server/auth/context";
import { getDb, withSystem, withUser } from "@/server/db/client";
import { createDemoWorkspace } from "@/server/services/demo";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PASSWORD = "correct-horse-42";
const USERS = {
  owner: { email: "amira@noor.test", name: "Amira Noor" },
  editor: { email: "sami@noor.test", name: "Sami Haddad" },
  guest: { email: "lina@riadbotanica.test", name: "Lina Morel" },
} as const;

function assertLocal() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed with NODE_ENV=production.");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`Refusing to seed a non-local database (${host}).`);
}

async function main() {
  assertLocal();
  const db = getDb();
  const existing = await db.selectFrom("profiles").select("id").where("email", "=", USERS.owner.email).executeTakeFirst();
  if (existing) {
    console.log("Already seeded. Run `pnpm db:reset` first for a fresh start.");
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  const ids = {} as Record<keyof typeof USERS, string>;
  for (const [key, user] of Object.entries(USERS) as [keyof typeof USERS, (typeof USERS)[keyof typeof USERS]][]) {
    const { rows } = await sql<{ id: string }>`
      insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
      values (gen_random_uuid(), 'authenticated', 'authenticated', ${user.email}, ${hash}, now(), ${JSON.stringify({ full_name: user.name })}::jsonb)
      returning id
    `.execute(db);
    ids[key] = rows[0]!.id;
  }
  const owner = { userId: ids.owner, email: USERS.owner.email, sessionId: null };

  // Organization, plan, and workspaces, created through the same SQL functions the app uses.
  const org = await withUser(owner, async (trx) => {
    const { rows } = await sql<{ organization_id: string; workspace_id: string; workspace_slug: string }>`
      select * from app.create_organization('Noor Studio', 'Noor Studio Agency', 'Africa/Casablanca')
    `.execute(trx);
    return rows[0]!;
  });
  await db
    .updateTable("subscriptions")
    .set({ plan_id: "agency", provider: "manual" })
    .where("organization_id", "=", org.organization_id)
    .execute();

  const createClient = (name: string, tz: string, description: string) =>
    withUser(owner, async (trx) => {
      const { rows } = await sql<{ workspace_id: string; workspace_slug: string }>`
        select * from app.create_workspace(${org.organization_id}::uuid, ${name}, 'client', ${tz}, ${description}, false)
      `.execute(trx);
      return rows[0]!;
    });
  const botanica = await createClient("Riad Botanica", "Africa/Casablanca", "Natural skincare made with argan and rose from the Atlas foothills.");
  const atlas = await createClient("Atlas Coffee Roasters", "Africa/Casablanca", "Specialty coffee roastery in Marrakech.");

  await withSystem(async (trx) => {
    await trx
      .insertInto("organization_members")
      .values([
        { organization_id: org.organization_id, user_id: ids.editor, role: "editor", invited_by: ids.owner },
        { organization_id: org.organization_id, user_id: ids.guest, role: "viewer", invited_by: ids.owner, is_client_guest: true },
      ])
      .execute();
    await trx
      .insertInto("workspace_members")
      .values([
        { workspace_id: botanica.workspace_id, organization_id: org.organization_id, user_id: ids.editor, role: "editor", assigned_by: ids.owner },
        { workspace_id: atlas.workspace_id, organization_id: org.organization_id, user_id: ids.editor, role: "viewer", assigned_by: ids.owner },
        { workspace_id: botanica.workspace_id, organization_id: org.organization_id, user_id: ids.guest, role: "editor", assigned_by: ids.owner },
      ])
      .execute();
    await trx
      .insertInto("social_accounts")
      .values({
        workspace_id: org.workspace_id,
        organization_id: org.organization_id,
        platform: "instagram",
        display_name: "Noor Studio Instagram",
        handle: "noorstudio",
        external_account_id: "manual_instagram_noorstudio",
        connection_status: "manual",
        connected_by: ids.owner,
      })
      .execute();
    await trx.updateTable("profiles").set({ default_workspace_id: org.workspace_id }).where("id", "=", ids.owner).execute();
  });

  const ctx: WorkspaceContext = {
    user: { id: ids.owner, email: USERS.owner.email, sessionId: null },
    identity: owner,
    workspace: {
      id: org.workspace_id,
      slug: org.workspace_slug,
      name: "Noor Studio Agency",
      kind: "internal",
      isDemo: false,
      timezone: "Africa/Casablanca",
      description: null,
      organizationId: org.organization_id,
    },
    organization: { id: org.organization_id, name: "Noor Studio", slug: "" },
    role: "owner",
    orgRole: "owner",
    isClientGuest: false,
  };
  const demo = await createDemoWorkspace(ctx);

  console.log(
    [
      "Seeded local development data.",
      `  Password for every user: ${PASSWORD}`,
      `  Owner:  ${USERS.owner.email}  → /w/${org.workspace_slug}/dashboard`,
      `  Editor: ${USERS.editor.email}`,
      `  Client guest (Riad Botanica only): ${USERS.guest.email}`,
      `  Clients: /w/${botanica.workspace_slug}, /w/${atlas.workspace_slug}`,
      `  Demo:    /w/${demo.slug}/dashboard`,
    ].join("\n"),
  );
}

main()
  .then(() => getDb().destroy())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await getDb().destroy();
    process.exit(1);
  });
