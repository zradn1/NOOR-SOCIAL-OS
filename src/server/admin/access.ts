import "server-only";
import { notFound } from "next/navigation";
import { isPlatformAdmin } from "@/server/auth/context";
import { getSessionUser, requireUser } from "@/server/auth/session";
import { forbidden } from "@/server/errors";

/** For admin pages: anyone who isn't a platform admin gets a 404, so the area isn't advertised. */
export async function requirePlatformAdmin() {
  const user = await requireUser("/admin");
  if (!(await isPlatformAdmin(user.id))) notFound();
  return user;
}

/** For admin actions: throws instead of navigating. */
export async function platformAdminForAction() {
  const user = await getSessionUser();
  if (!user || !(await isPlatformAdmin(user.id))) throw forbidden();
  return user;
}
