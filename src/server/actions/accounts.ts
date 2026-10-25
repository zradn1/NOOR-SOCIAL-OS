"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { PLATFORMS } from "@/lib/platforms/registry";
import { loadWorkspaceForAction } from "@/server/auth/context";
import { requestMeta } from "@/server/security/request";
import { createDemoWorkspace, demoAccountSeeder } from "@/server/services/demo";
import { addDemoAccount, addManualAccount, disconnectAccount } from "@/server/services/social-accounts";
import { redirect } from "next/navigation";
import type { ActionResult } from "./result";
import { parseInput, runAction } from "./run";

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);
const platformSchema = z.enum(PLATFORMS);

export async function addDemoAccountAction(slug: string, platform: string) {
  const result = await runAction(
    "accounts.add_demo",
    async () => {
      const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "accounts.connect");
      const parsed = platformSchema.parse(platform);
      await addDemoAccount(ctx, parsed, demoAccountSeeder(ctx.workspace.id), await requestMeta());
      return undefined;
    },
    "Demo account added with simulated history.",
  );
  if (result.ok) refresh();
  return result;
}

const manualSchema = z.object({
  platform: platformSchema,
  displayName: z.string().trim().min(1, "Enter the account name.").max(120),
  handle: z.string().trim().max(120).optional(),
});

export async function addManualAccountAction(slug: string, _prev: unknown, form: FormData): Promise<ActionResult<undefined>> {
  const result = await runAction(
    "accounts.add_manual",
    async () => {
      const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "accounts.connect");
      await addManualAccount(ctx, parseInput(manualSchema, form), await requestMeta());
      return undefined;
    },
    "Account added for manual tracking. It is not connected and cannot publish.",
  );
  if (result.ok) refresh();
  return result;
}

export async function disconnectAccountAction(slug: string, accountId: string) {
  const result = await runAction("accounts.disconnect", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "accounts.disconnect");
    return disconnectAccount(ctx, z.uuid().parse(accountId), await requestMeta());
  });
  if (result.ok) refresh();
  return result;
}

export async function createDemoWorkspaceAction(slug: string) {
  let destination = "";
  const result = await runAction("demo.create_workspace", async () => {
    const ctx = await loadWorkspaceForAction(slugSchema.parse(slug), "demo.manage");
    const created = await createDemoWorkspace(ctx, await requestMeta());
    destination = `/w/${created.slug}/dashboard`;
    return undefined;
  });
  if (result.ok) redirect(destination);
  return result;
}
