"use server";

import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/utils/redirect";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation/auth";
import { getSessionUser, identityOf } from "@/server/auth/session";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { logger } from "@/server/observability/logger";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/security/request";
import { recordAudit } from "@/server/services/audit";
import { homePath } from "@/server/services/organizations";
import { createSupabaseServerClient } from "@/server/supabase/server";
import type { ActionResult } from "./result";
import { parseInput, runAction } from "./run";

export async function signInAction(_prev: unknown, form: FormData): Promise<ActionResult<undefined>> {
  let destination = "/app";
  const result = await runAction("auth.sign_in", async () => {
    const input = parseInput(signInSchema, form);
    const meta = await requestMeta();
    await enforceRateLimit("signIn", meta.ipHash);
    await enforceRateLimit("signIn", `email:${input.email}`);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error || !data.user) {
      // One message for every failure so attackers can't probe accounts.
      throw new AppError("UNAUTHENTICATED", "That email and password combination didn't work.");
    }
    const requested = safeRedirectPath(input.next, "/app");
    destination =
      requested === "/app"
        ? await homePath({ userId: data.user.id, email: data.user.email ?? null, sessionId: null })
        : requested;
    return undefined;
  });
  if (result.ok) redirect(destination);
  return result;
}

export async function signUpAction(_prev: unknown, form: FormData): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  let signedIn = false;
  const result = await runAction("auth.sign_up", async () => {
    const input = parseInput(signUpSchema, form);
    const meta = await requestMeta();
    await enforceRateLimit("signUp", meta.ipHash);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName },
        emailRedirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/onboarding`,
      },
    });
    if (error) {
      if (error.code === "user_already_exists") {
        throw new AppError("CONFLICT", "An account with this email already exists. Sign in instead.");
      }
      if (error.code === "weak_password") throw new AppError("VALIDATION", "Choose a stronger password.");
      logger.warn("auth.sign_up_failed", { code: error.code });
      throw new AppError("INTERNAL", "We couldn't create your account. Please try again.");
    }
    signedIn = Boolean(data.session);
    return { needsConfirmation: !data.session };
  });
  if (result.ok && signedIn) redirect("/onboarding");
  return result.ok ? { ...result, message: "Check your inbox to confirm your email address." } : result;
}

export async function forgotPasswordAction(_prev: unknown, form: FormData): Promise<ActionResult<undefined>> {
  return runAction(
    "auth.forgot_password",
    async () => {
      const input = parseInput(forgotPasswordSchema, form);
      const meta = await requestMeta();
      await enforceRateLimit("passwordReset", meta.ipHash);
      await enforceRateLimit("passwordReset", `email:${input.email}`);
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/confirm?next=/reset-password`,
      });
      // Never reveal whether the address has an account.
      if (error) logger.warn("auth.reset_request_failed", { code: error.code });
      return undefined;
    },
    "If an account exists for that address, we've emailed a link to reset the password.",
  );
}

export async function resetPasswordAction(_prev: unknown, form: FormData): Promise<ActionResult<undefined>> {
  let destination = "/onboarding";
  const result = await runAction("auth.reset_password", async () => {
    const user = await getSessionUser();
    if (!user) throw new AppError("UNAUTHENTICATED", "Your reset link has expired. Request a new one.");
    const input = parseInput(resetPasswordSchema, form);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: input.password });
    if (error) {
      if (error.code === "same_password") throw new AppError("VALIDATION", "Choose a password you haven't used here before.");
      throw new AppError("VALIDATION", "We couldn't update your password. Try a different one.");
    }
    const meta = await requestMeta();
    await recordAudit({ action: "auth.password_changed", actorId: user.id, targetType: "user", targetId: user.id, ...meta });
    destination = await homePath(identityOf(user));
    return undefined;
  });
  if (result.ok) redirect(destination);
  return result;
}

export async function signOutAction() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (error) {
    logger.warn("auth.sign_out_failed", { error });
  }
  redirect("/sign-in");
}
