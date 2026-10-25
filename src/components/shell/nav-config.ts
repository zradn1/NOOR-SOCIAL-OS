import type { Permission } from "@/lib/auth/permissions";

export type NavIcon =
  | "dashboard"
  | "accounts"
  | "content"
  | "calendar"
  | "analytics"
  | "assistant"
  | "publishing"
  | "clients"
  | "billing"
  | "settings"
  | "admin";

export type NavItem = { href: string; label: string; icon: NavIcon; exact?: boolean };
export type NavSection = { label: string; items: NavItem[] };

type ItemDef = { path: string; label: string; icon: NavIcon; permission: Permission };

const WORKSPACE_ITEMS: ItemDef[] = [
  { path: "dashboard", label: "Dashboard", icon: "dashboard", permission: "workspace.view" },
  { path: "accounts", label: "Social Accounts", icon: "accounts", permission: "accounts.view" },
  { path: "content", label: "Content Studio", icon: "content", permission: "content.view" },
  { path: "calendar", label: "Calendar", icon: "calendar", permission: "calendar.view" },
  { path: "publishing", label: "Publishing", icon: "publishing", permission: "content.view" },
  { path: "analytics", label: "Analytics", icon: "analytics", permission: "analytics.view" },
  { path: "assistant", label: "AI Assistant", icon: "assistant", permission: "ai.use" },
];

const ORGANIZATION_ITEMS: ItemDef[] = [
  { path: "clients", label: "Clients", icon: "clients", permission: "org.clients" },
  { path: "billing", label: "Billing", icon: "billing", permission: "org.billing.view" },
  { path: "settings", label: "Settings", icon: "settings", permission: "workspace.view" },
];

/**
 * Builds role-aware navigation. `allows` is the server's permission check for
 * the current workspace context; hidden items are also enforced on each page.
 */
export function buildNavigation(
  workspaceSlug: string,
  allows: (permission: Permission) => boolean,
  isPlatformAdmin: boolean,
): NavSection[] {
  const toItem = (d: ItemDef): NavItem => ({ href: `/w/${workspaceSlug}/${d.path}`, label: d.label, icon: d.icon });
  const sections: NavSection[] = [
    { label: "Workspace", items: WORKSPACE_ITEMS.filter((d) => allows(d.permission)).map(toItem) },
    { label: "Organization", items: ORGANIZATION_ITEMS.filter((d) => allows(d.permission)).map(toItem) },
  ];
  if (isPlatformAdmin) {
    sections.push({ label: "Platform", items: [{ href: "/admin", label: "Admin", icon: "admin" }] });
  }
  return sections.filter((s) => s.items.length > 0);
}
