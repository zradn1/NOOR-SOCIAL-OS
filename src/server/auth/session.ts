import "server-only";
import { redirect } from "next/navigation";
import { sql } from "kysely";
import { cache } from "react";
import { getDb } from "@/server/db/client";
import { ConfigurationError } from "@/server/env";
import { createSupabaseServerClient } from "@/server/supabase/server";

export type SessionUser = {
  id: string;
  email: string | null;
  sessionId: string | null;
};

type SessionState = { user: SessionUser } | { blocked: true } | null;

/**
 * The verified session for this request. `getClaims()` validates the JWT
 * signature (locally via JWKS, or against the Auth server for symmetric keys);
 * never trust `getSession()` on the server. Access tokens stay valid until
 * they expire, so suspension and deletion are checked on every request too.
 */
export const getSessionState = cache(async (): Promise<SessionState> => {
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
  const { rows } = await sql<{ blocked: boolean }>`
    select (coalesce(banned_until > now(), false) or deleted_at is not null) as blocked
    from auth.users where id = ${claims.sub}::uuid
  `.execute(getDb());
  if (!rows[0] || rows[0].blocked) return { blocked: true };
  return {
    user: {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email.toLowerCase() : null,
      sessionId: typeof claims.session_id === "string" ? claims.session_id : null,
    },
  };
});

/** The signed-in, non-suspended user, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const state = await getSessionState();
  return state && "user" in state ? state.user : null;
});

/** Path that clears a suspended user's cookies before showing the sign-in page. */
export const BLOCKED_SESSION_PATH = "/auth/blocked";

export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const state = await getSessionState();
  if (state && "blocked" in state) redirect(BLOCKED_SESSION_PATH);
  if (!state) redirect(nextPath ? `/sign-in?next=${encodeURIComponent(nextPath)}` : "/sign-in");
  return state.user;
}

export function identityOf(user: SessionUser) {
  return { userId: user.id, email: user.email, sessionId: user.sessionId };
}
