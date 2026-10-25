import { describe, expect, it } from "vitest";
import { buildNavigation } from "@/components/shell/nav-config";
import { assignableRoles, can, hasRole, PERMISSIONS, ROLE_RANK, ROLES, type Role } from "@/lib/auth/permissions";

describe("role hierarchy", () => {
  it("matches app.role_rank() in SQL", () => {
    expect(ROLE_RANK).toEqual({ owner: 5, admin: 4, editor: 3, analyst: 2, viewer: 1 });
  });

  it("grants every permission whose minimum role is at or below the actor", () => {
    for (const role of ROLES) {
      for (const [permission, minimum] of Object.entries(PERMISSIONS)) {
        expect(can(role, permission as keyof typeof PERMISSIONS)).toBe(ROLE_RANK[role] >= ROLE_RANK[minimum as Role]);
      }
    }
  });

  it("denies everything to a missing role", () => {
    expect(can(null, "workspace.view")).toBe(false);
    expect(hasRole(undefined, "viewer")).toBe(false);
  });

  it.each([
    ["viewer", "content.create", false],
    ["analyst", "ai.use", true],
    ["analyst", "content.schedule", false],
    ["editor", "content.schedule", true],
    ["editor", "accounts.connect", false],
    ["admin", "accounts.disconnect", true],
    ["admin", "org.billing.manage", false],
    ["owner", "org.delete", true],
  ] as const)("%s → %s = %s", (role, permission, expected) => {
    expect(can(role, permission)).toBe(expected);
  });
});

describe("assignableRoles", () => {
  it("never lets admins grant owner", () => {
    expect(assignableRoles("admin")).toEqual(["admin", "editor", "analyst", "viewer"]);
  });
  it("lets owners grant every role", () => {
    expect(assignableRoles("owner")).toEqual([...ROLES]);
  });
  it("keeps editors at or below their own rank", () => {
    expect(assignableRoles("editor")).toEqual(["editor", "analyst", "viewer"]);
  });
});

describe("role-aware navigation", () => {
  const labels = (role: Role, admin = false) =>
    buildNavigation("acme-1a2b3c", (p) => can(role, p), admin).flatMap((s) =>
      s.items.map((i) => i.label),
    );

  it("hides organization sections from viewers", () => {
    expect(labels("viewer")).toEqual([
      "Dashboard",
      "Social Accounts",
      "Content Studio",
      "Calendar",
      "Publishing",
      "Analytics",
      "Settings",
    ]);
  });

  it("shows the AI assistant from analyst up", () => {
    expect(labels("analyst")).toContain("AI Assistant");
    expect(labels("viewer")).not.toContain("AI Assistant");
  });

  it("shows clients and billing to admins and the admin panel to platform admins only", () => {
    expect(labels("admin")).toEqual(expect.arrayContaining(["Clients", "Billing"]));
    expect(labels("owner")).not.toContain("Admin");
    expect(labels("viewer", true)).toContain("Admin");
  });

  it("scopes every link to the workspace", () => {
    const hrefs = buildNavigation("acme-1a2b3c", () => true, false).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs.every((h) => h.startsWith("/w/acme-1a2b3c/"))).toBe(true);
  });
});
