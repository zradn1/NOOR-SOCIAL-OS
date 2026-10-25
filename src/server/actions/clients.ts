"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createWorkspaceSchema, inviteClientGuestSchema } from "@/lib/validation/tenancy";
import { loadWorkspaceForAction } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/security/request";
import { inviteClientGuest, removeClientGuest, revokeClientInvitation } from "@/server/services/clients";
import { createWorkspace } from "@/server/services/workspaces";
import type { ActionResult } from "./result";
import { parseInput, runAction } from "./run";

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);

function done<T>(result: ActionResult<T>) {
  if (result.ok) refresh();
  return result;
}

export async function createWorkspaceAction(slug: string, _prev: unknown, form: FormData) {
  return done(
    await runAction(
      "workspace.create",
      async () => {
        const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "org.clients");
        const input = parseInput(createWorkspaceSchema, {
          name: form.get("name"),
          kind: form.get("kind"),
          timezone: form.get("timezone"),
          description: form.get("description") || undefined,
        });
        return createWorkspace(ctx, input, await requestMeta());
      },
      "Workspace created",
    ),
  );
}

export async function inviteClientGuestAction(slug: string, _prev: unknown, form: FormData) {
  return done(
    await runAction("client_guest.invite", async () => {
      const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "workspace.members");
      const input = parseInput(inviteClientGuestSchema, { email: form.get("email"), role: form.get("role") });
      await enforceRateLimit("invitation", ctx.user.id);
      return inviteClientGuest(ctx, input, await requestMeta());
    }),
  );
}

export async function revokeClientInvitationAction(slug: string, invitationId: string) {
  return done(
    await runAction(
      "client_guest.revoke",
      async () => {
        const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "workspace.members");
        await revokeClientInvitation(ctx, z.uuid().parse(invitationId), await requestMeta());
      },
      "Invitation revoked",
    ),
  );
}

export async function removeClientGuestAction(slug: string, userId: string) {
  return done(
    await runAction(
      "client_guest.remove",
      async () => {
        const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "workspace.members");
        await removeClientGuest(ctx, z.uuid().parse(userId), await requestMeta());
      },
      "Guest removed",
    ),
  );
}
