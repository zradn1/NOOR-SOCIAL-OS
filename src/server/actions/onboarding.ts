"use server";

import { redirect } from "next/navigation";
import { createOrganizationSchema } from "@/lib/validation/tenancy";
import { getSessionUser, identityOf } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { requestMeta } from "@/server/security/request";
import { createOrganization } from "@/server/services/organizations";
import type { ActionResult } from "./result";
import { parseInput, runAction } from "./run";

export async function createOrganizationAction(_prev: unknown, form: FormData): Promise<ActionResult<undefined>> {
  let destination = "";
  const result = await runAction("onboarding.create_organization", async () => {
    const user = await getSessionUser();
    if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
    const input = parseInput(createOrganizationSchema, form);
    const created = await createOrganization(identityOf(user), input, await requestMeta());
    destination = `/w/${created.workspaceSlug}/dashboard`;
    return undefined;
  });
  if (result.ok) redirect(destination);
  return result;
}
