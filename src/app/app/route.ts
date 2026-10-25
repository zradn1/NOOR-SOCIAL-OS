import { NextResponse, type NextRequest } from "next/server";
import { BLOCKED_SESSION_PATH, getSessionState, identityOf } from "@/server/auth/session";
import { resolveHomeWorkspaceSlug } from "@/server/services/organizations";

/** Sends a signed-in user to their home workspace, or to onboarding. */
export async function GET(request: NextRequest) {
  const state = await getSessionState();
  if (state && "blocked" in state) return NextResponse.redirect(new URL(BLOCKED_SESSION_PATH, request.url));
  if (!state) return NextResponse.redirect(new URL("/sign-in?next=/app", request.url));
  const user = state.user;
  const slug = await resolveHomeWorkspaceSlug(identityOf(user));
  const response = NextResponse.redirect(new URL(slug ? `/w/${slug}/dashboard` : "/onboarding", request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
