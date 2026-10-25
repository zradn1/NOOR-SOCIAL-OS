/**
 * Role-based permissions. Roles are hierarchical and mirror app.role_rank() in
 * SQL, so server checks, RLS policies, and UI visibility always agree.
 */
export const ROLES = ["owner", "admin", "editor", "analyst", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export const WORKSPACE_ROLES = ["admin", "editor", "analyst", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const ROLE_RANK: Record<Role, number> = { owner: 5, admin: 4, editor: 3, analyst: 2, viewer: 1 };

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  analyst: "Analyst",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: "Full control, including billing and deleting the organization.",
  admin: "Manages members, workspaces, connected accounts, and settings.",
  editor: "Creates, edits, and schedules content.",
  analyst: "Views everything, works with analytics and the AI assistant.",
  viewer: "Read-only access.",
};

/** Minimum role for each capability (workspace-scoped unless noted). */
export const PERMISSIONS = {
  "workspace.view": "viewer",
  "analytics.view": "viewer",
  "content.view": "viewer",
  "calendar.view": "viewer",
  "accounts.view": "viewer",
  "analytics.import": "analyst",
  "analytics.export": "analyst",
  "ai.use": "analyst",
  "content.create": "editor",
  "content.edit": "editor",
  "content.delete": "editor",
  "content.schedule": "editor",
  "publishing.retry": "editor",
  "media.upload": "editor",
  "accounts.connect": "admin",
  "accounts.disconnect": "admin",
  "workspace.manage": "admin",
  "workspace.members": "admin",
  "demo.manage": "admin",
  // Organization-scoped (checked against the organization role)
  "org.members": "admin",
  "org.clients": "admin",
  "org.settings": "admin",
  "org.billing.view": "admin",
  "org.audit.view": "admin",
  "org.billing.manage": "owner",
  "org.delete": "owner",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof PERMISSIONS;

export function hasRole(role: Role | null | undefined, minimum: Role) {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function can(role: Role | null | undefined, permission: Permission) {
  return hasRole(role, PERMISSIONS[permission]);
}

/** Roles an actor may grant: never above their own, and never owner unless they are one. */
export function assignableRoles(actor: Role): Role[] {
  return ROLES.filter((r) => ROLE_RANK[r] <= ROLE_RANK[actor] && (r !== "owner" || actor === "owner"));
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
