import { NextResponse, type NextRequest } from "next/server";
import { getSessionState } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * A suspended or deleted user can still hold an unexpired access token. Clear
 * the session cookies (only when the session really is blocked, so this link
 * can't sign anyone else out) and explain on the sign-in page.
 */
export async function GET(request: NextRequest) {
  const state = await getSessionState();
  if (!state || !("blocked" in state)) return NextResponse.redirect(new URL("/app", request.url));
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  const response = NextResponse.redirect(new URL("/sign-in?error=suspended", request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
