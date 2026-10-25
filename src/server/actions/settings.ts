"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  assignWorkspaceSchema,
  changeMemberRoleSchema,
  inviteMemberSchema,
  updateProfileSchema,
  updateWorkspaceSchema,
} from "@/lib/validation/tenancy";
import { loadWorkspaceForAction } from "@/server/auth/context";
import { getSessionUser, identityOf } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/security/request";
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  removeMember,
  revokeInvitation,
  setWorkspaceAssignment,
} from "@/server/services/members";
import { homePath } from "@/server/services/organizations";
import { updateProfile } from "@/server/services/profiles";
import { deleteWorkspace, renameOrganization, updateWorkspace } from "@/server/services/workspaces";
import type { ActionResult } from "./result";
import { parseInput, runAction } from "./run";

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);

function done<T>(result: ActionResult<T>) {
  if (result.ok) refresh();
  return result;
}

export async function updateProfileAction(_prev: unknown, form: FormData) {
  return done(
    await runAction(
      "profile.update",
      async () => {
        const user = await getSessionUser();
        if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
        await updateProfile(identityOf(user), parseInput(updateProfileSchema, form));
        return undefined;
      },
      "Profile saved.",
    ),
  );
}

export async function updateWorkspaceAction(slug: string, _prev: unknown, form: FormData) {
  return done(
    await runAction(
      "workspace.update",
      async () => {
        const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "workspace.manage");
        await updateWorkspace(ctx, parseInput(updateWorkspaceSchema, form), await requestMeta());
        return undefined;
      },
      "Workspace settings saved.",
    ),
  );
}

export async function deleteWorkspaceAction(slug: string) {
  let destination = "/onboarding";
  const result = await runAction("workspace.delete", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "org.clients");
    await deleteWorkspace(ctx, await requestMeta());
    destination = await homePath(ctx.identity);
    return undefined;
  });
  if (result.ok) redirect(destination);
  return result;
}

export async function renameOrganizationAction(slug: string, _prev: unknown, form: FormData) {
  return done(
    await runAction(
      "organization.rename",
      async () => {
        const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "org.settings");
        const { name } = parseInput(z.object({ name: z.string().trim().min(2).max(80) }), form);
        await renameOrganization(ctx, name, await requestMeta());
        return undefined;
      },
      "Organization renamed.",
    ),
  );
}

export async function changeMemberRoleAction(slug: string, input: { userId: string; role: string }) {
  return done(
    await runAction(
      "member.change_role",
      async () => {
        const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "org.members");
        const parsed = parseInput(changeMemberRoleSchema, input);
        await changeMemberRole(ctx, parsed.userId, parsed.role, await requestMeta());
        return undefined;
      },
      "Role updated.",
    ),
  );
}

export async function removeMemberAction(slug: string, userId: string) {
  return done(
    await runAction(
      "member.remove",
      async () => {
        const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "workspace.view");
        await removeMember(ctx, z.uuid().parse(userId), await requestMeta());
        return undefined;
      },
      "Member removed.",
    ),
  );
}

export async function inviteMemberAction(slug: string, _prev: unknown, form: FormData) {
  return done(
    await runAction("invitation.create", async () => {
      const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "org.members");
      const input = parseInput(inviteMemberSchema, {
        email: form.get("email"),
        role: form.get("role"),
        workspaceIds: form.getAll("workspaceIds"),
        workspaceRole: form.get("workspaceRole") || undefined,
      });
      await enforceRateLimit("invitation", ctx.user.id);
      return createInvitation(ctx, input, await requestMeta());
    }),
  );
}

export async function revokeInvitationAction(slug: string, invitationId: string) {
  return done(
    await runAction(
      "invitation.revoke",
      async () => {
        const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "org.members");
        await revokeInvitation(ctx, z.uuid().parse(invitationId), await requestMeta());
        return undefined;
      },
      "Invitation revoked.",
    ),
  );
}

export async function setWorkspaceAssignmentAction(slug: string, input: { userId: string; role: string | null }) {
  return done(
    await runAction(
      "workspace.assign",
      async () => {
        const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "workspace.members");
        if (input.role === null) {
          await setWorkspaceAssignment(ctx, z.uuid().parse(input.userId), null, await requestMeta());
        } else {
          const parsed = parseInput(assignWorkspaceSchema, input);
          await setWorkspaceAssignment(ctx, parsed.userId, parsed.role, await requestMeta());
        }
        return undefined;
      },
      "Workspace access updated.",
    ),
  );
}

export async function acceptInvitationAction(token: string) {
  let destination = "/app";
  const result = await runAction("invitation.accept", async () => {
    const user = await getSessionUser();
    if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
    const parsedToken = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/).parse(token);
    const accepted = await acceptInvitation(identityOf(user), parsedToken, await requestMeta());
    destination = accepted.workspaceSlug ? `/w/${accepted.workspaceSlug}/dashboard` : await homePath(identityOf(user));
    return undefined;
  });
  if (result.ok) redirect(destination);
  return result;
}
