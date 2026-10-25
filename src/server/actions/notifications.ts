"use server";

import { refresh } from "next/cache";
import { getSessionUser, identityOf } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { markAllNotificationsRead } from "@/server/services/notifications";
import { runAction } from "./run";

export async function markAllNotificationsReadAction() {
  const result = await runAction("notifications.mark_all_read", async () => {
    const user = await getSessionUser();
    if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
    await markAllNotificationsRead(identityOf(user));
    return undefined;
  });
  if (result.ok) refresh();
  return result;
}
