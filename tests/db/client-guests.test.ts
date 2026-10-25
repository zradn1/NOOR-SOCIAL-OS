import { createHash, randomBytes } from "node:crypto";
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
let owner: string; // agency owner
let manager: string; // agency editor, admin of the client workspace only
let staff: string; // agency editor on the internal workspace only
let guest: string; // client-side person
let stranger: string; // owner of another organization
let agency: OrgFixture;
let other: OrgFixture;
let clientWs: string;
let otherClientWs: string;
let demoWs: string;

const tokenHash = () => createHash("sha256").update(randomBytes(32)).digest("hex");

async function invite(userId: string, workspaceId: string, email: string, role = "editor", hash = tokenHash()) {
  return asUser(
    db,
    userId,
    async (c) => (await c.query("select app.create_client_invitation($1, $2, $3::workspace_role, $4) as id", [workspaceId, email, role, hash])).rows[0].id,
    { commit: true },
  );
}

beforeAll(async () => {
  db = await createTestDb();
  owner = await createAuthUser(db.sys, "owner@agency.test", "Agency Owner");
  manager = await createAuthUser(db.sys, "manager@agency.test", "Account Manager");
  staff = await createAuthUser(db.sys, "staff@agency.test", "Staff Writer");
  guest = await createAuthUser(db.sys, "brand@client.test", "Brand Lead");
  stranger = await createAuthUser(db.sys, "x@other.test");
  agency = await createOrganization(db, owner, "Agency");
  other = await createOrganization(db, stranger, "Other");
  await setPlan(db, agency.organizationId, "agency");
  await setPlan(db, other.organizationId, "pro");
  const create = (user: string, org: string, name: string, kind: string, demo = false) =>
    asUser(
      db,
      user,
      async (c) => (await c.query("select * from app.create_workspace($1, $2, $3::workspace_kind, 'UTC', null, $4)", [org, name, kind, demo])).rows[0].workspace_id as string,
      { commit: true },
    );
  clientWs = await create(owner, agency.organizationId, "Lumière", "client");
  otherClientWs = await create(owner, agency.organizationId, "Second Client", "client");
  demoWs = await create(owner, agency.organizationId, "Demo", "client", true);
  await addMember(db, agency.organizationId, manager, "editor");
  await addMember(db, agency.organizationId, staff, "editor");
  await assignWorkspace(db, clientWs, agency.organizationId, manager, "admin");
  await assignWorkspace(db, agency.workspaceId, agency.organizationId, staff, "editor");
});

afterAll(async () => {
  await db?.close();
});

describe("inviting client guests", () => {
  it("is refused to people without admin rights in the workspace", async () => {
    expect((await pgError(invite(staff, clientWs, "a@client.test"))).code).toBe("42501");
    expect((await pgError(invite(stranger, clientWs, "a@client.test"))).code).toBe("42501");
  });

  it("only targets live, non-demo client workspaces", async () => {
    expect((await pgError(invite(owner, agency.workspaceId, "a@client.test"))).message).toBe("invalid:guest_workspace");
    expect((await pgError(invite(owner, demoWs, "a@client.test"))).message).toBe("invalid:guest_workspace");
  });

  it("never grants the admin role", async () => {
    expect((await pgError(invite(owner, clientWs, "a@client.test", "admin"))).message).toBe("invalid:guest_role");
  });

  it("requires the client roles plan feature", async () => {
    const otherClient = await asUser(
      db,
      stranger,
      async (c) => (await c.query("select * from app.create_workspace($1, 'Their Client', 'client')", [other.organizationId])).rows[0].workspace_id,
      { commit: true },
    );
    expect((await pgError(invite(stranger, otherClient, "a@client.test"))).message).toBe("plan_feature:client_roles");
  });

  it("lets a workspace admin who isn't an organization admin invite, list, and revoke", async () => {
    const id = await invite(manager, clientWs, "temp@client.test", "viewer");
    const listed = await asUser(db, manager, async (c) => (await c.query("select id, client_guest, role::text from organization_invitations")).rows);
    expect(listed).toEqual([{ id, client_guest: true, role: "viewer" }]);
    await asUser(db, manager, (c) => c.query("update organization_invitations set revoked_at = now() where id = $1", [id]), { commit: true });
    const { rows } = await db.sys.query("select revoked_at is not null as revoked from organization_invitations where id = $1", [id]);
    expect(rows[0].revoked).toBe(true);
  });

  it("joins the guest to exactly one workspace as a flagged member", async () => {
    const hash = tokenHash();
    await invite(manager, clientWs, "brand@client.test", "editor", hash);
    await asUser(db, guest, (c) => c.query("select * from app.accept_invitation($1)", [hash]), { commit: true });
    const { rows } = await db.sys.query(
      "select m.role::text, m.is_client_guest, array_agg(wm.workspace_id) as workspaces from organization_members m join workspace_members wm on wm.user_id = m.user_id where m.user_id = $1 group by 1, 2",
      [guest],
    );
    expect(rows[0]).toEqual({ role: "viewer", is_client_guest: true, workspaces: [clientWs] });
  });
});

describe("what a guest can see and do", () => {
  it("sees only their client workspace", async () => {
    const rows = await asUser(db, guest, async (c) => (await c.query("select id from workspaces")).rows);
    expect(rows.map((r) => r.id)).toEqual([clientWs]);
  });

  it("sees workspace peers but not the agency's wider roster", async () => {
    const members = await asUser(db, guest, async (c) => (await c.query("select user_id from organization_members order by user_id")).rows.map((r) => r.user_id));
    expect(members.sort()).toEqual([guest, manager].sort());
    const profiles = await asUser(db, guest, async (c) => (await c.query("select email from profiles order by email")).rows.map((r) => r.email));
    expect(profiles).toEqual(["brand@client.test", "manager@agency.test"]);
  });

  it("staff still see the guest", async () => {
    const rows = await asUser(db, staff, async (c) => (await c.query("select email from profiles where id = $1", [guest])).rows);
    expect(rows).toHaveLength(1);
  });

  it("can't be assigned to other workspaces or promoted", async () => {
    expect((await pgError(db.sys.query("insert into workspace_members (workspace_id, organization_id, user_id, role) values ($1, $2, $3, 'viewer')", [agency.workspaceId, agency.organizationId, guest]))).message).toBe("invalid:guest_workspace");
    expect((await pgError(db.sys.query("update workspace_members set role = 'admin' where user_id = $1", [guest]))).message).toBe("invalid:guest_role");
    expect((await pgError(db.sys.query("update organization_members set role = 'admin' where user_id = $1", [guest]))).code).toBe("23514");
    // Another client workspace is allowed by the database (an admin decision), but not admin rank.
    await expect(
      db.sys.query("insert into workspace_members (workspace_id, organization_id, user_id, role) values ($1, $2, $3, 'viewer')", [otherClientWs, agency.organizationId, guest]),
    ).resolves.toBeDefined();
    await db.sys.query("delete from workspace_members where workspace_id = $1 and user_id = $2", [otherClientWs, guest]);
  });

  it("can't flag or unflag membership through the API", async () => {
    const error = await pgError(asUser(db, owner, (c) => c.query("update organization_members set is_client_guest = false where user_id = $1", [guest])));
    expect(error.code).toBe("42501");
  });

  it("can't invite anyone", async () => {
    expect((await pgError(invite(guest, clientWs, "friend@client.test"))).code).toBe("42501");
  });
});

describe("removing a guest", () => {
  it("is allowed to the client workspace's admin but not to unrelated staff", async () => {
    const blocked = await asUser(db, staff, async (c) => (await c.query("delete from organization_members where user_id = $1", [guest])).rowCount, { commit: true });
    expect(blocked).toBe(0);
    const removed = await asUser(db, manager, async (c) => (await c.query("delete from organization_members where user_id = $1", [guest])).rowCount, { commit: true });
    expect(removed).toBe(1);
    const { rows } = await db.sys.query("select count(*)::int as n from workspace_members where user_id = $1", [guest]);
    expect(rows[0].n).toBe(0);
  });

  it("workspace admins can't remove staff through the guest policy", async () => {
    const removed = await asUser(db, manager, async (c) => (await c.query("delete from organization_members where user_id = $1", [staff])).rowCount, { commit: true });
    expect(removed).toBe(0);
  });
});
