"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { platformAdminForAction } from "@/server/admin/access";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/security/request";
import { setOrganizationPlan, setUserSuspended } from "@/server/services/admin";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { ActionResult } from "./result";
import { parseInput, runAction } from "./run";

function done<T>(result: ActionResult<T>) {
  if (result.ok) refresh();
  return result;
}

const planSchema = z.object({
  organizationId: z.uuid(),
  planId: z.enum(["free", "starter", "pro", "agency"]),
  reason: z.string().trim().min(4, "Give a short reason.").max(300),
});

export async function assignPlanAction(_prev: unknown, form: FormData) {
  return done(
    await runAction(
      "admin.plan_assign",
      async () => {
        const admin = await platformAdminForAction();
        await enforceRateLimit("adminAction", admin.id);
        const input = parseInput(planSchema, { organizationId: form.get("organizationId"), planId: form.get("planId"), reason: form.get("reason") });
        await setOrganizationPlan(admin.id, input, await requestMeta());
      },
      "Plan updated",
    ),
  );
}

const suspendSchema = z.object({
  userId: z.uuid(),
  suspended: z.enum(["true", "false"]).transform((v) => v === "true"),
  reason: z.string().trim().min(4, "Give a short reason.").max(300),
});

/** Long enough to be indefinite; restoring sets it back to "none". */
const BAN_DURATION = "876000h";

export async function setUserSuspendedAction(_prev: unknown, form: FormData) {
  return done(
    await runAction(
      "admin.user_suspend",
      async () => {
        const admin = await platformAdminForAction();
        await enforceRateLimit("adminAction", admin.id);
        const input = parseInput(suspendSchema, { userId: form.get("userId"), suspended: form.get("suspended"), reason: form.get("reason") });
        await setUserSuspended(
          admin.id,
          input,
          {
            ban: async (userId, suspended) => {
              const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(userId, {
                ban_duration: suspended ? BAN_DURATION : "none",
              });
              if (error) throw error;
            },
          },
          await requestMeta(),
        );
      },
      "Saved",
    ),
  );
}
