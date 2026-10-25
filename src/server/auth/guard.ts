import { can, type Permission, type Role } from "@/lib/auth/permissions";
import { forbidden } from "@/server/errors";

/**
 * The authorization context every service receives. Built per request by
 * auth/context.ts; kept here, free of Next.js request APIs, so services also
 * run in the worker and scripts.
 */
export type WorkspaceContext = {
  user: { id: string; email: string | null; sessionId: string | null };
  identity: { userId: string; email: string | null; sessionId: string | null };
  workspace: {
    id: string;
    slug: string;
    name: string;
    kind: "internal" | "client";
    isDemo: boolean;
    timezone: string;
    description: string | null;
    organizationId: string;
  };
  organization: { id: string; name: string; slug: string };
  /** Effective role in this workspace. */
  role: Role;
  /** Role in the owning organization. */
  orgRole: Role;
  /** A client-side person with access to this client workspace only. */
  isClientGuest: boolean;
};

export function permits(ctx: WorkspaceContext, permission: Permission) {
  return can(permission.startsWith("org.") ? ctx.orgRole : ctx.role, permission);
}

export function assertCan(ctx: WorkspaceContext, permission: Permission) {
  if (!permits(ctx, permission)) throw forbidden();
}
