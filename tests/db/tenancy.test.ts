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
let alice: string; // owner of Acme
let bob: string; // owner of Globex (other tenant)
let carol: string; // Acme admin
let dave: string; // Acme editor, assigned to one workspace only
let erin: string; // Acme viewer, unassigned
let acme: OrgFixture;
let globex: OrgFixture;
let acmeClient: string; // second Acme workspace

const tokenHash = () => createHash("sha256").update(randomBytes(32)).digest("hex");

beforeAll(async () => {
  db = await createTestDb();
  alice = await createAuthUser(db.sys, "alice@acme.test", "Alice Owner");
  bob = await createAuthUser(db.sys, "bob@globex.test", "Bob Other");
  carol = await createAuthUser(db.sys, "carol@acme.test");
  dave = await createAuthUser(db.sys, "dave@acme.test");
  erin = await createAuthUser(db.sys, "erin@acme.test");
  acme = await createOrganization(db, alice, "Acme");
  globex = await createOrganization(db, bob, "Globex");
  await setPlan(db, acme.organizationId, "pro");
  acmeClient = await asUser(
    db,
    alice,
    async (c) => {
      const { rows } = await c.query("select * from app.create_workspace($1, 'Client Co', 'client')", [acme.organizationId]);
      return rows[0].workspace_id as string;
    },
    { commit: true },
  );
  await addMember(db, acme.organizationId, carol, "admin");
  await addMember(db, acme.organizationId, dave, "editor");
  await addMember(db, acme.organizationId, erin, "viewer");
  await assignWorkspace(db, acmeClient, acme.organizationId, dave, "editor");
});

afterAll(async () => {
  await db?.close();
});

describe("signup and organization bootstrap", () => {
  it("creates a profile for every new auth user", async () => {
    const { rows } = await db.sys.query("select email, full_name from public.profiles where id = $1", [alice]);
    expect(rows[0]).toEqual({ email: "alice@acme.test", full_name: "Alice Owner" });
  });

  it("creates the owner membership, a free subscription, and a default workspace", async () => {
    const member = await db.sys.query("select role from organization_members where organization_id = $1 and user_id = $2", [
      globex.organizationId,
      bob,
    ]);
    expect(member.rows[0].role).toBe("owner");
    const sub = await db.sys.query("select plan_id, status, provider from subscriptions where organization_id = $1", [
      globex.organizationId,
    ]);
    expect(sub.rows[0]).toEqual({ plan_id: "free", status: "active", provider: "none" });
    const profile = await db.sys.query("select default_workspace_id from profiles where id = $1", [bob]);
    expect(profile.rows[0].default_workspace_id).toBe(globex.workspaceId);
  });

  it("rejects anonymous callers", async () => {
    const err = await pgError(asUser(db, null, (c) => c.query("select * from app.create_organization('X Co', 'X')")));
    expect(err.code).toBe("42501");
  });
});

describe("tenant isolation", () => {
  it("never shows another tenant's organizations, workspaces, members, or profiles", async () => {
    await asUser(db, bob, async (c) => {
      const orgs = await c.query("select id from organizations");
      expect(orgs.rows.map((r) => r.id)).toEqual([globex.organizationId]);
      const workspaces = await c.query("select id from workspaces");
      expect(workspaces.rows.map((r) => r.id)).toEqual([globex.workspaceId]);
      const members = await c.query("select user_id from organization_members");
      expect(members.rows.map((r) => r.user_id)).toEqual([bob]);
      const profiles = await c.query("select id from profiles");
      expect(profiles.rows.map((r) => r.id)).toEqual([bob]);
    });
  });

  it("silently affects zero rows when updating another tenant's data", async () => {
    await asUser(db, bob, async (c) => {
      const res = await c.query("update workspaces set name = 'pwned' where id = $1", [acme.workspaceId]);
      expect(res.rowCount).toBe(0);
      const del = await c.query("delete from organization_members where organization_id = $1", [acme.organizationId]);
      expect(del.rowCount).toBe(0);
    });
  });

  it("refuses to create workspaces in an organization the caller does not belong to", async () => {
    const err = await pgError(
      asUser(db, bob, (c) => c.query("select * from app.create_workspace($1, 'Sneaky')", [acme.organizationId])),
    );
    expect(err.code).toBe("42501");
  });

  it("gives the anon role no access at all", async () => {
    const err = await pgError(asUser(db, null, (c) => c.query("select * from workspaces")));
    expect(err.code).toBe("42501");
  });

  it("keeps system tables away from API roles", async () => {
    for (const table of ["platform_admins", "billing_events", "rate_limit_buckets"]) {
      const err = await pgError(asUser(db, alice, (c) => c.query(`select * from ${table}`)));
      expect(err.code, table).toBe("42501");
    }
    const err = await pgError(asUser(db, alice, (c) => c.query("select app.rate_limit_hit('x', 60, 5)")));
    expect(err.code).toBe("42501");
  });
});

describe("workspace access and roles", () => {
  it("gives organization owners and admins every workspace", async () => {
    for (const user of [alice, carol]) {
      await asUser(db, user, async (c) => {
        const { rows } = await c.query("select id from workspaces order by created_at");
        expect(rows.map((r) => r.id)).toEqual([acme.workspaceId, acmeClient]);
      });
    }
  });

  it("requires explicit assignment for editors, analysts, and viewers", async () => {
    await asUser(db, dave, async (c) => {
      const { rows } = await c.query("select id from workspaces");
      expect(rows.map((r) => r.id)).toEqual([acmeClient]);
      const role = await c.query("select app.workspace_role($1) as assigned, app.workspace_role($2) as other", [
        acmeClient,
        acme.workspaceId,
      ]);
      expect(role.rows[0]).toEqual({ assigned: "editor", other: null });
    });
    await asUser(db, erin, async (c) => {
      const { rows } = await c.query("select id from workspaces");
      expect(rows).toHaveLength(0);
    });
  });

  it("lets workspace admins assign members but not editors or viewers", async () => {
    const err = await pgError(
      asUser(db, dave, (c) =>
        c.query(
          "insert into workspace_members (workspace_id, organization_id, user_id, role, assigned_by) values ($1, $2, $3, 'viewer', $4)",
          [acmeClient, acme.organizationId, erin, dave],
        ),
      ),
    );
    expect(err.code).toBe("42501");

    await asUser(db, carol, async (c) => {
      const res = await c.query(
        "insert into workspace_members (workspace_id, organization_id, user_id, role, assigned_by) values ($1, $2, $3, 'viewer', $4)",
        [acmeClient, acme.organizationId, erin, carol],
      );
      expect(res.rowCount).toBe(1);
    });
  });

  it("cannot assign someone from another organization to a workspace", async () => {
    const err = await pgError(
      asUser(db, alice, (c) =>
        c.query(
          "insert into workspace_members (workspace_id, organization_id, user_id, role, assigned_by) values ($1, $2, $3, 'viewer', $4)",
          [acme.workspaceId, acme.organizationId, bob, alice],
        ),
      ),
    );
    expect(err.code).toBe("23503");
  });

  it("removing an organization member removes their workspace assignments", async () => {
    const tmpUser = await createAuthUser(db.sys, "temp@acme.test");
    await addMember(db, acme.organizationId, tmpUser, "viewer");
    await assignWorkspace(db, acmeClient, acme.organizationId, tmpUser, "viewer");
    await asUser(
      db,
      carol,
      (c) => c.query("delete from organization_members where organization_id = $1 and user_id = $2", [acme.organizationId, tmpUser]),
      { commit: true },
    );
    const { rowCount } = await db.sys.query("select 1 from workspace_members where user_id = $1", [tmpUser]);
    expect(rowCount).toBe(0);
  });
});

describe("organization role management", () => {
  it("prevents admins from creating or demoting owners", async () => {
    const promote = await pgError(
      asUser(db, carol, (c) =>
        c.query("update organization_members set role = 'owner' where organization_id = $1 and user_id = $2", [
          acme.organizationId,
          dave,
        ]),
      ),
    );
    expect(promote.code).toBe("42501");
    const demote = await pgError(
      asUser(db, carol, (c) =>
        c.query("update organization_members set role = 'viewer' where organization_id = $1 and user_id = $2", [
          acme.organizationId,
          alice,
        ]),
      ),
    );
    expect(demote.code).toBe("42501");
  });

  it("prevents editors from changing anyone's role", async () => {
    await asUser(db, dave, async (c) => {
      const res = await c.query("update organization_members set role = 'admin' where user_id = $1", [dave]);
      expect(res.rowCount).toBe(0);
    });
  });

  it("keeps at least one owner", async () => {
    const err = await pgError(
      asUser(db, alice, (c) =>
        c.query("delete from organization_members where organization_id = $1 and user_id = $2", [acme.organizationId, alice]),
      ),
    );
    expect(err.message).toMatch(/last_owner/);
  });

  it("lets owners promote a second owner and then step down", async () => {
    await asUser(db, alice, async (c) => {
      await c.query("update organization_members set role = 'owner' where organization_id = $1 and user_id = $2", [
        acme.organizationId,
        carol,
      ]);
      const res = await c.query("update organization_members set role = 'admin' where organization_id = $1 and user_id = $2", [
        acme.organizationId,
        alice,
      ]);
      expect(res.rowCount).toBe(1);
    });
  });

  it("does not let users edit profiles other than their own, or protected columns", async () => {
    await asUser(db, carol, async (c) => {
      const res = await c.query("update profiles set full_name = 'x' where id = $1", [alice]);
      expect(res.rowCount).toBe(0);
    });
    const err = await pgError(asUser(db, carol, (c) => c.query("update profiles set email = 'x@y.z' where id = $1", [carol])));
    expect(err.code).toBe("42501");
  });

  it("refuses a default workspace the user cannot access", async () => {
    const err = await pgError(
      asUser(db, erin, (c) => c.query("update profiles set default_workspace_id = $1 where id = $2", [globex.workspaceId, erin])),
    );
    expect(err.code).toBe("42501");
  });
});

describe("plan limits", () => {
  it("enforces the free plan's single workspace", async () => {
    const err = await pgError(
      asUser(db, bob, (c) => c.query("select * from app.create_workspace($1, 'Second')", [globex.organizationId])),
    );
    expect(err.message).toBe("limit_exceeded:workspaces");
  });

  it("requires the client_workspaces feature for client workspaces", async () => {
    await setPlan(db, globex.organizationId, "starter");
    const err = await pgError(
      asUser(db, bob, (c) => c.query("select * from app.create_workspace($1, 'Client', 'client')", [globex.organizationId])),
    );
    expect(err.message).toBe("plan_feature:client_workspaces");
    await setPlan(db, globex.organizationId, "free");
  });

  it("falls back to free limits when a subscription is canceled", async () => {
    await db.sys.query("update subscriptions set status = 'canceled' where organization_id = $1", [acme.organizationId]);
    const { rows } = await db.sys.query("select app.effective_plan_id($1) as plan", [acme.organizationId]);
    expect(rows[0].plan).toBe("free");
    await db.sys.query("update subscriptions set status = 'active' where organization_id = $1", [acme.organizationId]);
  });

  it("allows one demo workspace that does not count against limits, and keeps it flagged", async () => {
    const demoId = await asUser(
      db,
      bob,
      async (c) => {
        const { rows } = await c.query("select * from app.create_workspace($1, 'Demo', 'internal', 'UTC', null, true)", [
          globex.organizationId,
        ]);
        return rows[0].workspace_id as string;
      },
      { commit: true },
    );
    const again = await pgError(
      asUser(db, bob, (c) =>
        c.query("select * from app.create_workspace($1, 'Demo 2', 'internal', 'UTC', null, true)", [globex.organizationId]),
      ),
    );
    expect(again.message).toBe("conflict:demo_workspace_exists");
    const flip = await pgError(db.sys.query("update workspaces set is_demo = false where id = $1", [demoId]));
    expect(flip.message).toMatch(/immutable/);
  });
});

describe("invitations", () => {
  it("only lets organization admins invite", async () => {
    const err = await pgError(
      asUser(db, dave, (c) =>
        c.query("select app.create_invitation($1, 'new@acme.test', 'viewer', '{}', null, $2)", [acme.organizationId, tokenHash()]),
      ),
    );
    expect(err.code).toBe("42501");
  });

  it("accepts an invitation for the invited email and assigns workspaces", async () => {
    const hash = tokenHash();
    await asUser(
      db,
      alice,
      (c) =>
        c.query("select app.create_invitation($1, 'Frank@Acme.test', 'analyst', $2, 'analyst', $3)", [
          acme.organizationId,
          [acmeClient],
          hash,
        ]),
      { commit: true },
    );
    const frank = await createAuthUser(db.sys, "frank@acme.test");
    const mallory = await createAuthUser(db.sys, "mallory@evil.test");

    const mismatch = await pgError(asUser(db, mallory, (c) => c.query("select * from app.accept_invitation($1)", [hash])));
    expect(mismatch.message).toBe("invalid:invitation_email_mismatch");

    const result = await asUser(db, frank, (c) => c.query("select * from app.accept_invitation($1)", [hash]), { commit: true });
    expect(result.rows[0].organization_id).toBe(acme.organizationId);

    await asUser(db, frank, async (c) => {
      const { rows } = await c.query("select id from workspaces");
      expect(rows.map((r) => r.id)).toEqual([acmeClient]);
      const role = await c.query("select app.workspace_role($1) as r", [acmeClient]);
      expect(role.rows[0].r).toBe("analyst");
    });

    const reuse = await pgError(asUser(db, frank, (c) => c.query("select * from app.accept_invitation($1)", [hash])));
    expect(reuse.message).toBe("invalid:invitation");
  });

  it("rejects expired invitations", async () => {
    const hash = tokenHash();
    await asUser(
      db,
      alice,
      (c) => c.query("select app.create_invitation($1, 'late@acme.test', 'viewer', '{}', null, $2, 1)", [acme.organizationId, hash]),
      { commit: true },
    );
    await db.sys.query("update organization_invitations set expires_at = now() - interval '1 minute' where token_hash = $1", [hash]);
    const late = await createAuthUser(db.sys, "late@acme.test");
    const err = await pgError(asUser(db, late, (c) => c.query("select * from app.accept_invitation($1)", [hash])));
    expect(err.message).toBe("invalid:invitation_expired");
  });

  it("enforces the plan's member limit, counting pending invitations", async () => {
    // Globex is on the free plan (2 members): Bob plus one pending invitation fills it.
    await asUser(
      db,
      bob,
      (c) => c.query("select app.create_invitation($1, 'one@globex.test', 'viewer', '{}', null, $2)", [globex.organizationId, tokenHash()]),
      { commit: true },
    );
    const err = await pgError(
      asUser(db, bob, (c) =>
        c.query("select app.create_invitation($1, 'two@globex.test', 'viewer', '{}', null, $2)", [globex.organizationId, tokenHash()]),
      ),
    );
    expect(err.message).toBe("limit_exceeded:members");
  });

  it("hides invitations from non-admins", async () => {
    await asUser(db, dave, async (c) => {
      const { rows } = await c.query("select id from organization_invitations");
      expect(rows).toHaveLength(0);
    });
  });
});

describe("billing visibility", () => {
  it("shows subscriptions to organization admins only", async () => {
    await asUser(db, carol, async (c) => {
      const { rows } = await c.query("select organization_id from subscriptions");
      expect(rows.map((r) => r.organization_id)).toEqual([acme.organizationId]);
    });
    await asUser(db, dave, async (c) => {
      const { rows } = await c.query("select organization_id from subscriptions");
      expect(rows).toHaveLength(0);
    });
  });

  it("does not allow API roles to change a subscription", async () => {
    const err = await pgError(asUser(db, alice, (c) => c.query("update subscriptions set plan_id = 'agency'")));
    expect(err.code).toBe("42501");
  });
});

describe("rate limiting", () => {
  it("allows up to the maximum hits per window", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const { rows } = await db.sys.query("select app.rate_limit_hit('test:key', 60, 3) as ok");
      results.push(rows[0].ok);
    }
    expect(results).toEqual([true, true, true, false]);
  });
});
