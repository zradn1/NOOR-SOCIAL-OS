import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ConfigurationError } from "@/server/env";
import { createSupabaseServerClient } from "@/server/supabase/server";

export type SessionUser = {
  id: string;
  email: string | null;
  sessionId: string | null;
};

/**
 * The verified user for this request, or null. `getClaims()` validates the
 * JWT signature (locally via JWKS, or against the Auth server for symmetric
 * keys). Never trust `getSession()` on the server.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    if (error instanceof ConfigurationError) return null;
    throw error;
  }
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub || claims.role !== "authenticated") return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email.toLowerCase() : null,
    sessionId: typeof claims.session_id === "string" ? claims.session_id : null,
  };
});

export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(nextPath ? `/sign-in?next=${encodeURIComponent(nextPath)}` : "/sign-in");
  return user;
}

export function identityOf(user: SessionUser) {
  return { userId: user.id, email: user.email, sessionId: user.sessionId };
}
